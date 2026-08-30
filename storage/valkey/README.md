# @keyv/valkey [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Valkey storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey.svg)](https://www.npmjs.com/package/@keyv/valkey)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey)](https://npmjs.com/package/@keyv/valkey)

[Valkey](https://valkey.io) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Valkey is the open source replacement to Redis which decided to do a [dual license](https://redis.com/blog/redis-adopts-dual-source-available-licensing/) approach moving forward. Valkey is a drop-in replacement for Redis and is fully compatible with the Redis protocol.

We are using the [iovalkey](https://www.npmjs.com/package/iovalkey) which is a Node.js client for Valkey based on the `ioredis` client.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Using the createKeyv function](#using-the-createkeyv-function)
- [Migrating to v6](#migrating-to-v6)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [capabilities](#capabilities)
  - [namespace](#namespace)
  - [useSets](#usesets)
  - [useRedisSets (deprecated)](#useredissets-deprecated)
  - [client](#client)
- [Methods](#methods)
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
- [Events](#events)
- [Expiration and TTL](#expiration-and-ttl)
- [Clustering](#clustering)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/valkey
```

## Usage

This is using the helper `createKeyv` function to create a Keyv instance with the Valkey storage adapter:

```js
import {createKeyv} from '@keyv/valkey';

const keyv = createKeyv('redis://localhost:6379');
keyv.on('error', handleConnectionError);
await keyv.set('foo', 'bar');
console.log(await keyv.get('foo')); // 'bar'
```

If you want to specify the `KeyvValkey` class directly, you can do so:

```js
import Keyv from 'keyv';
import KeyvValkey from '@keyv/valkey';

const keyv = new Keyv(new KeyvValkey('redis://user:pass@localhost:6379', { disable_resubscribing: true }));
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
import Keyv from 'keyv';
import KeyvValkey from '@keyv/valkey';

const keyvValkey = new KeyvValkey('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: keyvValkey });
```

Or reuse a previous Redis instance:

```js
import Keyv from 'keyv';
import Redis from 'iovalkey';
import KeyvValkey from '@keyv/valkey';

const redis = new Redis('redis://user:pass@localhost:6379');
const keyvValkey = new KeyvValkey(redis);
const keyv = new Keyv({ store: keyvValkey });
```

Or reuse a previous Redis cluster:

```js
import Keyv from 'keyv';
import Redis from 'iovalkey';
import KeyvValkey from '@keyv/valkey';

const cluster = new Redis.Cluster([{ host: '127.0.0.1', port: 7001 }]);
const keyvValkey = new KeyvValkey(cluster);
const keyv = new Keyv({ store: keyvValkey });
```

## Using the createKeyv function

`createKeyv` is a convenience factory that returns a `Keyv` instance with the Valkey adapter already wired. The namespace is taken from the adapter so it is preserved whether it was passed in the connect options object or the second argument.

```js
import {createKeyv} from '@keyv/valkey';

const keyv = createKeyv('redis://localhost:6379', { namespace: 'my-app' });
console.log(keyv.namespace); // 'my-app'
console.log(keyv.store.namespace); // 'my-app'
```

If no connect argument is provided, the default URI is `redis://localhost:6379`.

## Migrating to v6

### Breaking changes

#### Properties instead of opts

In v6, all configuration options are exposed as top-level properties with getters and setters:

```js
// v6
store.useSets; // false (default)
store.useSets = true;
store.namespace = 'my-namespace';
```

#### `useRedisSets` renamed to `useSets`

The `useRedisSets` option has been renamed to `useSets`. The `useRedisSets` property is still available as a deprecated getter/setter on the class but will be removed in a future version.

#### `redis` property renamed to `client`

The `redis` property has been renamed to `client` and is now properly typed as `Redis | Cluster` instead of `any`. Update any code that accesses the underlying iovalkey instance:

```js
// v5
store.redis;

// v6
store.client;
```

#### `useSets` default changed from `true` to `false`

The default value of `useSets` has changed from `true` to `false` for performance reasons. When enabled, a set is maintained for each namespace to track keys, which can lead to memory leaks in high-throughput scenarios. If you depend on the previous behavior, explicitly set `useSets: true` in your options:

```js
const store = new KeyvValkey('redis://localhost:6379', { useSets: true });
```

#### `useSets` key prefix changed from `namespace:` to `sets:`

When `useSets` is enabled, all keys (both data keys and the SET tracking key) now use a `sets:` prefix instead of `namespace:`. This prevents `WRONGTYPE` collisions between the SET tracking key and regular string data keys that could share the same name.

- **Data keys**: `sets:<namespace>:<key>` (was `namespace:<namespace>:<key>`)
- **SET tracking key**: `sets:<namespace>` (was `namespace:<namespace>`)

The `clear()` method automatically detects and cleans up legacy `namespace:`-prefixed SET keys, so no manual migration is needed.

#### Missing values are `undefined`, never `null`

`get()`, `getMany()`, and `iterator()` return `undefined` for missing keys. They never return `null`.

## Constructor Options

`KeyvValkey` accepts a connection URI string, an options object, or an existing iovalkey `Redis`/`Cluster` instance. The options object accepts the following properties along with any [`RedisOptions`](https://github.com/valkey-io/iovalkey#connect-to-valkey) from the `iovalkey` library:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `undefined` | Valkey connection URI (`redis://` or `valkey://`) |
| `useSets` | `boolean` | `false` | Whether to use sets for namespace key management |
| `namespace` | `string` | `undefined` | Namespace used to prefix keys for multi-tenant isolation |

## Properties

All configuration options are exposed as properties with getters and setters on the `KeyvValkey` instance. You can read or update them after construction.

### capabilities

Read-only capability descriptor for the v6 storage contract. `capabilities.expires` is `true`, which means `set()` / `setMany()` accept an absolute Unix-ms `expires` timestamp.

- Type: `KeyvStorageCapability`

```js
const store = new KeyvValkey('redis://localhost:6379');
console.log(store.capabilities.expires); // true
```

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvValkey('redis://localhost:6379');
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

### useSets

Get or set whether to use sets for key management. When `true`, a set is maintained for each namespace to track keys. When `false`, keys are prefixed with the namespace and pattern matching is used instead.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvValkey('redis://localhost:6379', { useSets: true });
console.log(store.useSets); // true
```

**Note**: When `useSets` is `true`, a set is maintained for each namespace which can lead to memory leaks in high-performance scenarios. This is why the default is `false`.

When `useSets` is enabled, all keys use the `sets:` prefix (e.g., `sets:myns:mykey`) to isolate them from non-useSets keys. The SET tracking key is stored at `sets:<namespace>`.

When `useSets` is `false`, the `clear()` function uses pattern matching (`KEYS` command) to find and delete keys, which may be slower on very large databases. With no namespace this matches every key in the current database.

### useRedisSets (deprecated)

Deprecated alias for `useSets`. Use `useSets` instead.

### client

Get or set the underlying iovalkey `Redis` or `Cluster` client instance. Replacing the client re-wires Hookified event listeners on the new instance and removes them from the previous one.

- Type: `Redis | Cluster`

```js
import Redis from 'iovalkey';

const store = new KeyvValkey('redis://localhost:6379');
console.log(store.client); // Redis instance

// Replace with a new instance
store.client = new Redis('redis://localhost:6380');
```

## Methods

### .get(key)

Returns the value for the given key. Returns `undefined` if the key does not exist. Never returns `null`.

```js
const value = await store.get('foo');
```

### .getMany(keys)

Returns an array of values for the given keys. Returns `undefined` for any key that does not exist. Never returns `null` entries. In cluster mode, keys are grouped by hash slot and fetched with per-slot `MGET`.

```js
const values = await store.getMany(['foo', 'bar']);
```

### .set(key, value, expires?)

Sets a value for the given key with an optional absolute `expires` (Unix ms since epoch). The adapter writes it via `PXAT`. Through Keyv (`keyv.set(key, value, ttl)`) you still pass a relative TTL in milliseconds — Keyv converts it to `expires` for you.

Returns `true` if the value was stored, or `false` if `value` is `undefined` or the write failed (the failure is also emitted as an `error` event).

```js
await store.set('foo', 'bar');
await store.set('foo', 'bar', Date.now() + 5000); // expires in ~5 seconds
```

### .setMany(entries)

Sets multiple key-value pairs in a single batch operation using `MULTI/EXEC` transactions. Each entry is a `KeyvStorageEntry<Value>` object (`{ key: string, value: Value, expires?: number }`) where `expires` is an absolute Unix ms timestamp, and `Value` is inferred from the entries provided. Entries with `undefined` values are skipped. Returns a `boolean[]` with per-entry success tracking by inspecting each command's result. In cluster mode, entries are grouped by hash slot with results mapped back to the original order.

```js
const results = await store.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux', expires: Date.now() + 5000 },
]); // [true, true]
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await store.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store. Each key is deleted individually (cluster-safe; not a single `MULTI` batch). Returns a `boolean[]` indicating whether each key was deleted.

```js
const results = await store.deleteMany(['foo', 'bar']); // [true, true]
```

### .has(key)

Returns `true` if the key exists in the store, `false` otherwise.

```js
const exists = await store.has('foo');
```

### .hasMany(keys)

Checks if multiple keys exist in the store in a single batch operation. In cluster mode, keys are grouped by hash slot. Returns an array of booleans.

```js
const results = await store.hasMany(['foo', 'bar', 'baz']);
// [true, true, false]
```

### .clear()

Clears all entries from the store. If a namespace is set, only entries within that namespace are cleared. If no namespace is set and `useSets` is `false`, this uses `KEYS *` and removes every key in the current database.

```js
await store.clear();
```

### .iterator()

Returns an async iterator for iterating over all key-value pairs in the store. The iterator uses the namespace configured on the instance. Missing values are yielded as `undefined`, never `null`.

```js
for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Disconnects from the Valkey server. Subsequent operations on this adapter will throw.

```js
await store.disconnect();
```

## Events

`KeyvValkey` extends [Hookified](https://hookified.org), so you can use `on`, `once`, `off`, and `emit`. The adapter re-emits the following events from the underlying iovalkey client:

| Event | Source | Payload |
| --- | --- | --- |
| `error` | client `error` | The `Error` from the client |
| `connect` | client `connect` | The iovalkey client instance |
| `reconnecting` | client `reconnecting` | Arguments from the client (e.g. delay) |
| `disconnect` | client `close` | The iovalkey client instance |

```js
const store = new KeyvValkey('redis://localhost:6379');

store.on('error', (error) => {
  console.error(error);
});

store.on('connect', (client) => {
  console.log('connected', client);
});

store.on('reconnecting', () => {
  console.log('reconnecting');
});

store.on('disconnect', () => {
  console.log('disconnected');
});
```

Replacing `store.client` removes listeners from the previous client and attaches them to the new one, so events are not duplicated or leaked.

## Expiration and TTL

Keyv hands this adapter an **absolute** expiry — a Unix timestamp in milliseconds — computed once on the Keyv host. The adapter writes it with `SET ... PXAT`, the absolute-expiry option, so the deadline is immune to clock skew and to any latency between Keyv computing the expiry and Valkey receiving the command. The same applies to `setMany`, including the per-hash-slot grouping used in cluster mode.

Unlike the [Redis adapter](https://github.com/jaredwray/keyv/tree/main/storage/redis#expiration-and-ttl), there is **no relative `PX` fallback** and none is needed: `PXAT` was added in Redis 6.2, and every Valkey release is forked from Redis 7.2+, so absolute expiry is always available. You always call `keyv.set(key, value, ttl)` with a relative millisecond `ttl` (or rely on the `ttl` option); Keyv converts it to the absolute `PXAT` deadline for you.

## Clustering

The adapter supports Valkey and Redis clusters via iovalkey's `Cluster` class. Pass a `Redis.Cluster` instance directly to the constructor:

```js
import KeyvValkey from '@keyv/valkey';
import Redis from 'iovalkey';

const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 7001 },
  { host: '127.0.0.1', port: 7002 },
  { host: '127.0.0.1', port: 7003 },
]);
const store = new KeyvValkey(cluster);
```

`getMany`, `setMany`, and `hasMany` automatically group keys by hash slot and run separate commands per slot group. This avoids `CROSSSLOT` errors without any extra configuration.

`deleteMany` deletes each key individually, which is also cluster-safe.

Single-key methods (`get`, `set`, `delete`, `has`) work automatically in cluster mode — iovalkey routes each command to the correct node.

### Cluster gotchas

- **`clear()` with `useSets: false` (the default)** uses the `KEYS` command, which only scans the node that receives the command. In cluster mode this may miss keys on other nodes.
- **`iterator()` in cluster mode** uses `SCAN`, which only iterates keys on the node the command is routed to. It may not return all keys across the cluster.
- **`useSets: true` is not cluster-safe.** Tracking set members and data keys hash to different slots, so `SET` + `SADD` in a `MULTI` transaction (and bulk `UNLINK` of tracked keys on `clear()`) can raise `CROSSSLOT`. Prefer the default `useSets: false` on a cluster.

## License

[MIT © Jared Wray](LICENSE)
