# @keyv/valkey-glide [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Valkey GLIDE storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey-glide.svg)](https://www.npmjs.com/package/@keyv/valkey-glide)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey-glide)](https://npmjs.com/package/@keyv/valkey-glide)

[Valkey GLIDE](https://glide.valkey.io/) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

This adapter uses the official [`@valkey/valkey-glide`](https://www.npmjs.com/package/@valkey/valkey-glide) client (Rust core, Node bindings). Use [`@keyv/valkey`](https://github.com/jaredwray/keyv/tree/main/storage/valkey) if you want the `iovalkey` / ioredis-compatible client instead.

GLIDE can route reads with **AZ affinity** (`readFrom` + `clientAz`) and executes multi-key commands (`MGET`, `UNLINK`, `MSET`) in a cluster-aware way, which is the main reason to pick this adapter over `@keyv/valkey`.

## Table of Contents

- [Install](#install)
- [Platform Support](#platform-support)
- [Usage](#usage)
- [Using the createKeyv function](#using-the-createkeyv-function)
- [Using Sets](#using-sets)
- [AZ affinity](#az-affinity)
- [Constructor Options](#constructor-options)
- [GLIDE Defaults](#glide-defaults)
- [Properties](#properties)
- [Methods](#methods)
- [Events](#events)
- [Expiration and TTL](#expiration-and-ttl)
- [Clustering](#clustering)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/valkey-glide
```

`keyv` is a peer dependency. The adapter uses your installed Keyv package, including for instances returned by `createKeyv()`.

## Platform Support

`@valkey/valkey-glide` ships a native (Rust core) binary and supports Linux (glibc and musl) and macOS. **Windows is not supported.** For Windows, use [`@keyv/valkey`](https://github.com/jaredwray/keyv/tree/main/storage/valkey), which uses the `iovalkey` client. Installing GLIDE adds roughly 20 MB to `node_modules`.

To learn more about the project, visit the [Valkey GLIDE GitHub repository](https://github.com/valkey-io/valkey-glide).

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

## Using Sets

`useSets` is **off by default**. Enable it to track each namespace's keys in a Valkey SET so `clear()` and `iterator()` can select tracked keys without scanning the database for matching prefixes.

```js
import {createKeyv} from '@keyv/valkey-glide';

const keyv = createKeyv('redis://localhost:6379', {
  namespace: 'my-app',
  useSets: true,
});

await keyv.set('user:123', { name: 'Ada' });
await keyv.clear(); // Removes keys tracked for my-app.
```

**Enabling sets has a performance cost.** Each write adds an `SADD` tracking command, and each deletion adds an `SREM` command. A single `set()` waits for `SET` and then `SADD`; batch writes and deletes include the extra commands in their GLIDE batch. This adds server work and can increase latency or reduce throughput, even when commands are batched. The tracking set also uses memory to store key names. The impact depends on your workload; benchmark with your expected key count and write rate.

The tradeoff is more targeted namespace operations: `clear()` reads the tracking set with `SMEMBERS`, while `iterator()` streams its members with `SSCAN` and fetches values one page at a time. This avoids scanning unrelated database keys and prevents a parent namespace from selecting every key under a nested namespace merely because its prefix matches. `clear()` loads the full tracking set into memory, so very large namespaces still have a memory and command-size cost.

Sets work with both standalone and cluster clients. Tracking updates are **non-atomic**: a data write or deletion can succeed while its tracking command fails. Affected batch entries return `false` and emit an error. Expiring a data key does not automatically remove its tracking-set member; iteration skips missing values, and `clear()` removes the tracked members.

With sets enabled, data keys use `sets:<namespace>::<key>` and the tracking set is `sets:<namespace>`. Without a namespace, these are `sets::<key>` and `sets`. The separator before the data key is configurable through `namespaceSeparator`; tracking-set names are unchanged. Enabling or disabling `useSets` changes the storage prefix and does not migrate existing keys.

Keep the default `false` when you do not need tracking and want to avoid its write, delete, and memory overhead. Enable it when the benefits of tracked namespace operations justify that cost.

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

## Constructor Options

`KeyvValkeyGlide` accepts a URI string, an options object, or an existing `GlideClient` / `GlideClusterClient`. Adapter fields:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `undefined` | Valkey connection URI (`redis://`, `rediss://`, `valkey://`, `valkeys://`) |
| `cluster` | `boolean` | `false` | Create a `GlideClusterClient` instead of `GlideClient` |
| `useSets` | `boolean` | `false` | Track keys for namespace operations, adding write/delete and memory overhead; see [Using Sets](#using-sets) |
| `namespace` | `string` | `undefined` | Prefix keys for multi-tenant isolation |
| `namespaceSeparator` | `string` | `"::"` | Separator between the storage prefix and data key |

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

`capabilities.expires` is `true`. `set()` / `setMany()` take an absolute Unix-ms `expires` timestamp.

### namespace

Get or set the key namespace.

### namespaceSeparator

Get or set the separator between the storage prefix and data key. Defaults to `::`, matching `@keyv/valkey`.

```js
const store = new KeyvValkeyGlide('redis://localhost:6379', {
  namespace: 'my-app',
  namespaceSeparator: '--',
});
await store.set('user:123', 'value'); // Stored as namespace:my-app--user:123.
```

The default key layout is `namespace:<namespace>::<key>`, or `sets:<namespace>::<key>` with `useSets: true`. Without a namespace and with sets disabled, keys are stored unchanged. The option also works with existing GLIDE clients and `createKeyv()`. It can be changed through `store.namespaceSeparator`, but changing it does not rename existing keys. For a single-colon separator, set `namespaceSeparator: ':'`.

An empty string is supported, but removes the boundary between the prefix and key. Choose a nonempty separator that does not appear in namespace names when relying on prefix scanning. Glob characters in the namespace and separator are matched literally by `clear()` and `iterator()`.

### useSets

Default `false`. When `true`, data keys and a tracking SET use the `sets:` prefix. See [Using Sets](#using-sets) for configuration, performance costs, and non-atomic update behavior.

### client

The underlying `GlideClient` or `GlideClusterClient`. Throws if the adapter has not connected yet — call `await store.getClient()` first, or perform any storage operation.

Replacing `store.client` switches to an existing instance without closing the previous one. It invalidates any pending connection attempt so that attempt cannot overwrite the assigned client. Waiting calls to `getClient()` reject and emit one `error` event when the invalidated attempt completes; any unused client it creates is closed.

## Methods

Same Keyv storage contract as `@keyv/valkey`: `get`, `getMany`, `set`, `setMany`, `delete`, `deleteMany`, `has`, `hasMany`, `clear`, `iterator`, `disconnect`.

When `useSets` is `false`, `clear()` and `iterator()` use `SCAN MATCH` with the pattern `namespace:<namespace><namespaceSeparator>*` (`namespace:<namespace>::*` by default). Glob metacharacters in both the namespace and separator are escaped. With the default separator, `users`, `users-archive`, and `users:archive` stay separate. A namespace containing the full separator, such as `users::archive`, can still match its parent `users`; use `useSets: true`, which selects tracked members instead, when you need that distinction.

`getClient()` returns the connected GLIDE client, creating it if needed.

With `useSets: true`, `iterator()` pages through the namespace's tracking set using `SSCAN` and fetches values one page at a time. It excludes untracked keys and other namespaces, including nested namespaces such as `users:archive` when iterating `users`. Tracked keys whose values have expired or been deleted are skipped.

Missing keys are `undefined`, never `null`.

`setMany`, `deleteMany`, and `hasMany` report individual GLIDE command failures through one `error` event per batch and return `false` for affected entries, preserving input order and successful results. The event contains the original `RequestError` for one failed command or an `AggregateError` whose `errors` contains all command failures. With `useSets: true`, a failed tracking command also makes that entry's result `false`. Batches are not atomic: a data write or deletion may have completed even if its tracking command failed.

`disconnect()` calls GLIDE `close()` and invalidates pending connection attempts. A late connection is closed without emitting `connect`, and waiting calls to `getClient()` reject with an `error` event. The adapter stays disconnected until an existing client is explicitly assigned through `store.client`.

## Events

`KeyvValkeyGlide` extends [Hookified](https://hookified.org). It emits:

| Event | When |
| --- | --- |
| `connect` | A client was created or assigned |
| `disconnect` | `disconnect()` closed the client |
| `error` | Connection, write, or batch command failed |

GLIDE itself is not an EventEmitter, so connection errors surface through thrown promises and the adapter `error` event rather than client `error` / `reconnecting` listeners.

## Expiration and TTL

Keyv passes an **absolute** Unix-ms expiry. The adapter writes it with `SET` + `PXAT` (`TimeUnit.UnixMilliseconds`). You still call `keyv.set(key, value, ttl)` with a relative millisecond TTL.

## Clustering

Pass a `GlideClusterClient` or `{ cluster: true, addresses: [...] }`.

`getMany` uses GLIDE `mget`, which splits cross-slot keys internally. With `useSets: false`, `clear()` and `iterator()` use cluster `SCAN` to cover every node. With `useSets: true`, they use the namespace's tracking set: `SMEMBERS` for `clear()` and paged `SSCAN` for `iterator()`.

### Cluster gotchas

- **`useSets: true` adds tracking overhead and is non-atomic**, on a cluster or standalone. See [Using Sets](#using-sets).

## License

[MIT © Jared Wray](LICENSE)
