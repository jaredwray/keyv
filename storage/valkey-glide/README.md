# @keyv/valkey-glide [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Valkey GLIDE storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey-glide.svg)](https://www.npmjs.com/package/@keyv/valkey-glide)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey-glide)](https://npmjs.com/package/@keyv/valkey-glide)

[Valkey GLIDE](https://glide.valkey.io/) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

This adapter uses the official [`@valkey/valkey-glide`](https://www.npmjs.com/package/@valkey/valkey-glide) client (Rust core, Node bindings). Use [`@keyv/valkey`](https://github.com/jaredwray/keyv/tree/main/storage/valkey) if you want the `iovalkey` / ioredis-compatible client instead.

Both adapters store keys in the same layout, so you can switch between them without losing data. Reasons to pick this one: GLIDE can read from replicas in the client's availability zone (**AZ affinity**, `readFrom` + `clientAz`), it splits multi-key commands such as `MGET` and `UNLINK` across cluster slots itself, `clear()` walks keys with `SCAN` instead of `KEYS`, and values that aren't valid UTF-8 read back as their original bytes. See [Differences from @keyv/valkey](#differences-from-keyvvalkey).

## Table of Contents

- [Install](#install)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Using the createKeyv function](#using-the-createkeyv-function)
- [AZ affinity](#az-affinity)
- [Constructor Options](#constructor-options)
- [GLIDE Defaults](#glide-defaults)
- [Properties](#properties)
  - [capabilities](#capabilities)
  - [namespace](#namespace)
  - [namespaceSeparator](#namespaceseparator)
  - [useSets](#usesets)
  - [client](#client)
- [Methods](#methods)
  - [.getClient()](#getclient)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.clear()](#clear)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
- [Error Handling](#error-handling)
- [Events](#events)
- [Expiration and TTL](#expiration-and-ttl)
- [Clustering](#clustering)
- [Differences from @keyv/valkey](#differences-from-keyvvalkey)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/valkey-glide
```

## Platform Support

`@valkey/valkey-glide` ships a native (Rust core) binary. It supports Linux (glibc and musl) and macOS — there is no Windows build. Installing it adds roughly 20 MB to `node_modules`.

## Usage

`GlideClient.createClient` is async. The adapter constructor is **lazy**: the first command (or `getClient()`) opens the connection.

```js
import {createKeyv} from '@keyv/valkey-glide';

const keyv = createKeyv('redis://localhost:6379');
keyv.on('error', handleConnectionError);
await keyv.set('foo', 'bar');
console.log(await keyv.get('foo')); // 'bar'
```

Specify the class directly:

```js
import Keyv from 'keyv';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const store = new KeyvValkeyGlide('redis://localhost:6379');
const keyv = new Keyv({ store });
```

Reuse an existing GLIDE client:

```js
import Keyv from 'keyv';
import {GlideClient} from '@valkey/valkey-glide';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const client = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
});
const store = new KeyvValkeyGlide(client);
const keyv = new Keyv({ store });
```

Cluster client:

```js
import {GlideClusterClient} from '@valkey/valkey-glide';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const client = await GlideClusterClient.createClient({
  addresses: [
    { host: '127.0.0.1', port: 7001 },
    { host: '127.0.0.1', port: 7002 },
    { host: '127.0.0.1', port: 7003 },
  ],
});
const store = new KeyvValkeyGlide(client);
```

Or let the adapter create a cluster client:

```js
const store = new KeyvValkeyGlide({
  cluster: true,
  addresses: [{ host: '127.0.0.1', port: 7001 }],
});
```

## Using the createKeyv function

```js
import {createKeyv} from '@keyv/valkey-glide';

const keyv = createKeyv('redis://localhost:6379', { namespace: 'my-app' });
console.log(keyv.namespace); // 'my-app'
console.log(keyv.store.namespace); // 'my-app'
```

If no connect argument is provided, the default URI is `redis://localhost:6379`.

## AZ affinity

Pass GLIDE `readFrom` and `clientAz` so readonly commands prefer replicas in the same availability zone. See [GLIDE read strategies](https://glide.valkey.io/how-to/connections/read-strategy/).

```js
import KeyvValkeyGlide from '@keyv/valkey-glide';

const store = new KeyvValkeyGlide({
  addresses: [{ host: 'clustercfg.example.cache.amazonaws.com', port: 6379 }],
  useTLS: true,
  cluster: true,
  readFrom: 'AZAffinity',
  clientAz: 'us-east-1a',
});
```

`clientAz` is required when `readFrom` is `AZAffinity` or `AZAffinityReplicasAndPrimary`.

Reads from a replica can lag behind recent writes. `clear()` deletes what it reads, so it always reads the tracking SET and scans keys on the primaries, whatever `readFrom` says. A key written just before `clear()` is never left behind because a replica hadn't received it yet.

## Constructor Options

`KeyvValkeyGlide` accepts a URI string, an options object, or an existing `GlideClient` / `GlideClusterClient`. Adapter fields:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `undefined` | Valkey connection URI (`redis://`, `rediss://`, `valkey://`, `valkeys://`) |
| `cluster` | `boolean` | `false` | Create a `GlideClusterClient` instead of `GlideClient` |
| `useSets` | `boolean` | `false` | Track keys in a Valkey SET for faster namespaced `clear()` |
| `namespace` | `string` | `undefined` | Prefix keys for multi-tenant isolation |
| `namespaceSeparator` | `string` | `"::"` | Separator between the namespace and the key, as in `namespace:<namespace>::<key>` |

All other fields are forwarded to GLIDE (`addresses`, `useTLS`, `credentials`, `readFrom`, `clientAz`, `requestTimeout`, `clientName`, `databaseId`, …). See [BaseClientConfiguration](https://glide.valkey.io/languages/nodejs/api/interfaces/BaseClient.BaseClientConfiguration.html).

`uri` only parses host, port, `useTLS`, credentials, and the path as a database index — query parameters are ignored. Pass GLIDE fields (`readFrom`, `requestTimeout`, …) as constructor options instead of putting them in the URI.

## GLIDE Defaults

GLIDE's own defaults apply unless you override them:

| Setting | Default | Override with |
| --- | --- | --- |
| Request timeout | 250 ms | `requestTimeout` (ms) |
| Connection timeout | 2 s | `advancedConfiguration.connectionTimeout` (ms) |
| In-flight request limit | 1000 | `inflightRequestsLimit` |

```js
const store = new KeyvValkeyGlide('redis://localhost:6379', {
  requestTimeout: 1000,
  inflightRequestsLimit: 2000,
  advancedConfiguration: { connectionTimeout: 5000 },
});
```

`setMany`, `deleteMany`, and `hasMany` execute one GLIDE batch instead of one command per key, so they stay well under the in-flight limit regardless of input size.

## Properties

### capabilities

`capabilities.expires` is `true`: `set()` and `setMany()` take an absolute Unix-ms `expires` timestamp, which Keyv computes from the relative TTL you pass it.

### namespace

Get or set the namespace. When set, keys are stored as `namespace:<namespace>::<key>`, or `sets:<namespace>::<key>` with `useSets`, and `clear()` and `iterator()` only touch that namespace. Keyv's `namespace` option sets it on the adapter.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvValkeyGlide('redis://localhost:6379', { namespace: 'my-namespace' });
console.log(store.namespace); // 'my-namespace'
```

### namespaceSeparator

Get or set the separator between the namespace and the key. That is the same layout as `@keyv/valkey`, so both adapters read each other's data when they use the same `namespace`, `namespaceSeparator` and `useSets`.

- Type: `string`
- Default: `"::"`

```js
const store = new KeyvValkeyGlide('redis://localhost:6379', { namespace: 'my-namespace' });
console.log(store.namespaceSeparator); // '::'
await store.set('foo', 'bar'); // stored as namespace:my-namespace::foo
```

### useSets

Get or set whether a Valkey SET tracks each namespace's keys. When `true`, `clear()` removes the keys the set lists instead of scanning. Data keys use the `sets:` prefix (`sets:<namespace>::<key>`), and the set is stored at `sets:<namespace>`, or `sets` with no namespace.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvValkeyGlide('redis://localhost:6379', { useSets: true });
console.log(store.useSets); // true
```

**Note**: the set grows with every key written to the namespace, which costs memory under heavy write loads. That's why the default is `false`.

A standalone server updates a key and its set entry in one transaction. On a cluster the set sits in another hash slot; see [`useSets` in cluster mode](#usesets-in-cluster-mode).

`useSets: true` doesn't keep apart namespaces that extend one another with the separator: `archive::x` in `users` and `x` in `users::archive` are both `sets:users::archive::x`. Keep the separator out of namespace names that have to stay apart.

### client

Get or set the underlying `GlideClient` or `GlideClusterClient`. The adapter connects lazily, so reading `client` before the first storage call or `getClient()` throws; call `await store.getClient()` to connect and get it. A client passed to the constructor is available right away.

- Type: `GlideClient | GlideClusterClient`

Assigning a client switches to it and emits `connect`. The previous client is not closed.

```js
import {GlideClient} from '@valkey/valkey-glide';

const client = await store.getClient();
console.log(store.client === client); // true

store.client = await GlideClient.createClient({ addresses: [{ host: 'localhost', port: 6380 }] });
```

## Methods

### .getClient()

Returns the connected GLIDE client, opening one from the constructor config the first time. Concurrent calls share one connection attempt. Rejects if the connection fails or the adapter was disconnected.

```js
const client = await store.getClient();
```

### .get(key)

Returns the value for the given key, or `undefined` if the key does not exist. Never returns `null`. A value whose bytes aren't valid UTF-8 comes back as a `Buffer` with the same bytes.

```js
const value = await store.get('foo');
```

### .getMany(keys)

Returns the values for the given keys in order, with `undefined` for any key that does not exist. Uses one `MGET`, which GLIDE splits across hash slots in cluster mode.

```js
const values = await store.getMany(['foo', 'bar']);
```

### .set(key, value, expires?)

Sets a value for the given key with an optional absolute `expires` (Unix ms since epoch), written via `PXAT`. Through Keyv (`keyv.set(key, value, ttl)`) you pass a relative TTL in milliseconds and Keyv converts it. A `Buffer` or `Uint8Array` value is stored as raw bytes.

Returns `true` if the value was stored, or `false` if `value` is `undefined` or the write failed (the failure is also emitted as an `error` event).

```js
await store.set('foo', 'bar');
await store.set('foo', 'bar', Date.now() + 5000); // expires in ~5 seconds
```

### .setMany(entries)

Sets multiple entries in one GLIDE batch. Each entry is `{ key, value, expires? }`, with `expires` an absolute Unix ms timestamp. Returns a `boolean[]` in input order: `true` for each stored entry, and `false` for each that failed (the failure is emitted as an `error` event). Entries with `undefined` values are skipped and reported as `true`, as in `@keyv/valkey`.

```js
const results = await store.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux', expires: Date.now() + 5000 },
]); // [true, true]
```

### .delete(key)

Deletes a key with `UNLINK`. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await store.delete('foo');
```

### .deleteMany(keys)

Deletes multiple keys in one GLIDE batch, with one `UNLINK` per key. Returns a `boolean[]` saying which keys existed and were deleted.

```js
const results = await store.deleteMany(['foo', 'bar']); // [true, true]
```

### .has(key)

Returns `true` if the key exists, `false` otherwise.

```js
const exists = await store.has('foo');
```

### .hasMany(keys)

Checks multiple keys in one GLIDE batch of `EXISTS` commands. Returns a `boolean[]`.

```js
const results = await store.hasMany(['foo', 'bar', 'baz']); // [true, true, false]
```

### .clear()

Clears all entries in the namespace. With `useSets`, it removes the keys the namespace's set tracks. Otherwise it walks the keys matching `namespace:<namespace>::*` with `SCAN` (glob characters in the namespace and separator are escaped) and unlinks them page by page. A namespace that merely shares a prefix, such as `users-archive`, is left alone. A namespace that extends it with the separator, such as `users::archive`, can't be told apart from keys containing the separator and is cleared too, so keep the separator out of namespace names that have to stay apart.

**If no namespace is set and `useSets` is `false`, `clear()` removes every key in the current database.**

`clear()` reads the tracking set and scans keys on the primaries even when `readFrom` sends other reads to replicas, since a lagging replica could miss a key written just before. In cluster mode every primary is scanned.

```js
await store.clear();
```

### .iterator()

Returns an async iterator over the key-value pairs in the namespace. It uses the same key pattern as `clear()` and one `MGET` per `SCAN` page, and in cluster mode GLIDE's cluster scan covers every node. Unlike `clear()`, the iterator reads wherever `readFrom` sends reads, so with a replica strategy it can lag recent writes. Missing values are yielded as `undefined`, never `null`.

```js
for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Closes the GLIDE client and emits `disconnect`. Later operations reject until you assign a client through `store.client`. A connection that was still opening is closed when it finishes.

```js
await store.disconnect();
```

## Error Handling

`set()` and `setMany()` report a failed write, including a failed connection, by emitting `error` and returning `false`. The other methods reject. Through Keyv, each failed operation emits one `error` on the Keyv instance, and Keyv rejects instead when nothing listens for `error`.

```js
const keyv = createKeyv('redis://localhost:6379');
keyv.on('error', (error) => {
  console.error(error);
});
```

## Events

`KeyvValkeyGlide` extends [Hookified](https://hookified.org), so you can use `on`, `once`, `off`, and `emit`. It emits:

| Event | When | Payload |
| --- | --- | --- |
| `connect` | A client was created or assigned | The GLIDE client |
| `disconnect` | `disconnect()` closed the client | The GLIDE client |
| `error` | `set()` or `setMany()` failed, including a failed connection | The `Error` |

GLIDE itself is not an EventEmitter, so there are no client `error` or `reconnecting` events to forward. Connection problems surface as rejected calls and as `error` from `set()` and `setMany()`.

## Expiration and TTL

Keyv hands this adapter an **absolute** expiry, a Unix timestamp in milliseconds computed once on the Keyv host. The adapter writes it with `SET ... PXAT` (`TimeUnit.UnixMilliseconds`), in `setMany` too, so the deadline doesn't drift with latency between Keyv and Valkey. You still call `keyv.set(key, value, ttl)` with a relative millisecond TTL, and Keyv converts it.

## Clustering

Pass a `GlideClusterClient` or `{ cluster: true, addresses: [...] }`.

GLIDE routes single-key commands to the right node and splits multi-key commands across hash slots itself, so `getMany`, `setMany`, `deleteMany` and `hasMany` each run as one batch without `CROSSSLOT` errors. `iterator()` uses GLIDE's cluster `SCAN` and `clear()` scans each primary, so both cover every node.

### `useSets` in cluster mode

The tracking set and the data keys hash to different slots, which a cluster can't update in one transaction. In cluster mode the adapter updates them with separate commands instead, in an order that keeps every stored key in the set, even when another client writes, deletes or clears at the same time, or a command fails part-way:

- `set()` and `setMany()` add keys to the set both before and after writing them.
- `delete()` and `deleteMany()` remove keys from the set between two `UNLINK`s. `clear()` does the same for every key it removes.

The set can end up listing keys that are no longer stored, which `clear()` removes harmlessly. Each `set()` and `delete()` takes three round trips instead of one transaction. This is the same protocol `@keyv/valkey` uses.

## Differences from @keyv/valkey

The two adapters share the key layout, the options above and the storage contract. They differ in:

- **Client**: GLIDE (Rust core) instead of `iovalkey`. Pass a `GlideClient` or `GlideClusterClient`, or options GLIDE accepts (`addresses`, `readFrom`, `clientAz`, …). For a cluster, use `cluster: true` or a `GlideClusterClient` rather than an iovalkey `Cluster`.
- **Lazy connect**: GLIDE opens connections asynchronously, so the adapter connects on the first storage call or `getClient()`, and `store.client` throws until then.
- **Events**: no `reconnecting` event, and client errors surface as rejected calls rather than forwarded `error` events.
- **`clear()`** walks keys with `SCAN` instead of `KEYS`, and reads on primaries.
- **Binary values** read back as their original bytes instead of being decoded as UTF-8.
- **No `useRedisSets`** alias for `useSets`.

## License

[MIT © Jared Wray](LICENSE)
