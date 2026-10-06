# @keyv/etcd [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Etcd storage adapter for [Keyv](https://github.com/jaredwray/keyv), powered by our own from-scratch etcd v3 client — no third-party etcd library required

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/etcd.svg)](https://www.npmjs.com/package/@keyv/etcd)
[![npm](https://img.shields.io/npm/dm/@keyv/etcd)](https://npmjs.com/package/@keyv/etcd)

## Features

- Talks to etcd directly over its HTTP/JSON gateway via a small in-house client — no `etcd3` or other third-party etcd packages
- Full TypeScript support
- TTL support via etcd leases (millisecond input, converted to seconds internally)
- Namespace support for key isolation across multiple Keyv instances
- Async iterator support for scanning keys
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations
- `createKeyv` helper for quick setup

## Requirements

- **etcd 3.4 or newer** — this adapter uses the etcd v3 API (`/v3/kv/range`, `/v3/kv/put`, `/v3/lease/grant`, etc.) exposed by etcd's built-in HTTP/JSON gateway. etcd serves these `/v3/` paths from version 3.4 on. etcd v2 is not supported.
- **Node.js 22.19 or newer** — the client uses the global `fetch` and `AbortSignal.timeout` APIs.

## Table of Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Migrating to v6](#migrating-to-v6)
- [Options](#options)
- [Properties](#properties)
  - [.client](#client)
  - [.url](#url)
  - [.ttl](#ttl)
  - [.busyTimeout](#busytimeout)
  - [.namespace](#namespace)
  - [.namespaceSeparator](#namespaceseparator)
- [Methods](#methods)
  - [constructor(url?, options?)](#constructorurl-options)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
  - [.formatKey(key)](#formatkeykey)
  - [.createKeyPrefix(key, namespace?)](#createkeyprefixkey-namespace)
  - [.removeKeyPrefix(key, namespace?)](#removekeyprefixkey-namespace)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/etcd
```

You also need a running etcd 3.4+ server reachable from your Node process. For local development:

```shell
docker run --rm -p 2379:2379 registry.k8s.io/etcd:3.5.15-0 \
  etcd --listen-client-urls=http://0.0.0.0:2379 --advertise-client-urls=http://0.0.0.0:2379
```

## Quick Start with createKeyv

```js
import { createKeyv } from '@keyv/etcd';

const keyv = createKeyv('etcd://localhost:2379');

// set a value
await keyv.set('foo', 'bar');

// get a value
const value = await keyv.get('foo');

// set with TTL (milliseconds)
await keyv.set('foo', 'bar', 6000);

// delete a value
await keyv.delete('foo');
```

You can also pass options:

```js
import { createKeyv } from '@keyv/etcd';

const keyv = createKeyv('etcd://localhost:2379', { ttl: 5000 });

// or using an options object
const keyv2 = createKeyv({ url: '127.0.0.1:2379', ttl: 5000 });
```

## Usage

```js
import Keyv from 'keyv';
import KeyvEtcd from '@keyv/etcd';

const store = new KeyvEtcd('etcd://localhost:2379');
const keyv = new Keyv({ store });

// set a value
await keyv.set('foo', 'bar');

// set a value with TTL (in milliseconds)
await keyv.set('foo', 'bar', 6000);

// get a value
const value = await keyv.get('foo');

// delete a value
await keyv.delete('foo');

// clear the values written without a namespace
await keyv.clear();

// disconnect
await store.disconnect();
```

## Usage with Namespaces

Namespacing is handled natively by the adapter — keys are prefixed with the namespace and separator (`namespace::key`, set with `namespaceSeparator`) before being written to etcd, and the prefix is stripped from keys returned by `iterator()`. Setting a `namespace` on a `Keyv` instance propagates it to the underlying store automatically. Use a separate store instance per namespace so each keeps its own prefix:

```js
import Keyv from 'keyv';
import KeyvEtcd from '@keyv/etcd';

const keyv1 = new Keyv({ store: new KeyvEtcd('etcd://localhost:2379'), namespace: 'namespace1' });
const keyv2 = new Keyv({ store: new KeyvEtcd('etcd://localhost:2379'), namespace: 'namespace2' });

// keys are isolated by namespace
await keyv1.set('foo', 'bar1');
await keyv2.set('foo', 'bar2');

const value1 = await keyv1.get('foo'); // 'bar1'
const value2 = await keyv2.get('foo'); // 'bar2'
```

With no namespace, `clear()` and `iterator()` only touch entries written without a namespace. They leave other namespaces' entries and other applications' keys in etcd alone. Each value records the namespace it was written under, and entries written before that was recorded count when their key has no `:`. Entries Keyv v5 wrote are left alone too, since nothing sets their `{ value, expires }` JSON apart from another application's. To have `clear()` delete every key in etcd and `iterator()` return every key, set `noNamespaceAffectsAll: true`:

```js
const store = new KeyvEtcd('etcd://localhost:2379', { noNamespaceAffectsAll: true });
await store.clear(); // deletes every key in etcd
```

You can also set the namespace directly on the store:

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.namespace = 'myapp';

await store.set('foo', 'bar'); // stored as 'myapp:foo'
await store.get('foo'); // 'bar'
```

## Migrating to v6

- **The `etcd3` package was replaced by a built-in client.** v5 used the `etcd3` package, which talks gRPC. v6 has no etcd dependency. It sends HTTP/JSON requests to etcd's gRPC gateway, using the `/v3/` endpoints that etcd 3.4 and later serve. etcd turns the gateway on by default, so don't start the server with `--enable-grpc-gateway=false`. `store.client` is now the built-in `EtcdClient`, not an `Etcd3` instance.
- **The store `ttl` applies per key.** In v5, `ttl` created one etcd lease when the store was constructed, and every key was attached to it. When that lease expired, every key on it was deleted at once, no matter when it was written, and later writes failed. In v6, a key written without an expiry lives for `ttl` from its own write, on its own lease. Keys written with a TTL through Keyv also get their own lease.
- **The `lease` property was removed.** Remove any code that reads or assigns `store.lease`.
- **The `ttlSupport` and `opts` properties were removed.** Read settings from the store's own properties instead, such as `store.url`, `store.ttl`, and `store.busyTimeout`.
- **Keys written by v5 need the same namespace and separator.** v5 stored keys as `<namespace>:<key>`, and Keyv v5 used `keyv` as the namespace when none was set. Keyv v6 has no default namespace, and it joins the namespace and key with `::`. To read those keys, pass the same namespace to Keyv and set `namespaceSeparator` to `':'`:

```js
const keyv = new Keyv(new KeyvEtcd('etcd://localhost:2379', { namespaceSeparator: ':' }), { namespace: 'keyv' });
```

If v5 ran with `useKeyPrefix: false`, its keys have no prefix, so leave the namespace unset. Without a namespace, `clear()` deletes every key in etcd. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#keyvetcd-default-ttl-applies-per-key) for more.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'127.0.0.1:2379'` | The etcd server URL. The `etcd://` protocol prefix is automatically stripped. |
| `uri` | `string` | — | Alias for `url` |
| `ttl` | `number` | `undefined` | Default TTL in milliseconds for keys written without an expiry, counted from each write. Each such key gets its own etcd lease. |
| `busyTimeout` | `number` | `undefined` | Per-request timeout in milliseconds. Aborts hung requests via `AbortSignal.timeout`. |
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation |
| `namespaceSeparator` | `string` | `'::'` | Separator placed between the namespace and key |
| `noNamespaceAffectsAll` | `boolean` | `false` | With no namespace, whether `clear()` and `iterator()` reach every key in etcd instead of only entries written without a namespace |

```js
import KeyvEtcd from '@keyv/etcd';

// Using a URI string
const store = new KeyvEtcd('etcd://localhost:2379');

// Using an options object
const store2 = new KeyvEtcd({ url: '127.0.0.1:2379', ttl: 5000 });

// Using a URI string with additional options
const store3 = new KeyvEtcd('etcd://localhost:2379', { ttl: 5000, busyTimeout: 3000 });
```

## Properties

### .client

The underlying `EtcdClient` instance — a lightweight wrapper around the etcd v3 HTTP/JSON gateway. Can be used to issue raw etcd requests directly.

| Type | Default |
|---|---|
| `EtcdClient` | Created from the `url` option |

### .url

The etcd server URL.

| Type | Default |
|---|---|
| `string` | `'127.0.0.1:2379'` |

### .ttl

Default TTL in milliseconds for keys written without an expiry, counted from each write. It can be changed at any time, and each such key gets its own etcd lease, rounded up to whole seconds.

| Type | Default |
|---|---|
| `number \| undefined` | `undefined` |

### .busyTimeout

Per-request timeout in milliseconds. When set, every HTTP request to etcd is aborted via `AbortSignal.timeout` if it does not complete within this window. Updating the setter applies to subsequent requests.

| Type | Default |
|---|---|
| `number \| undefined` | `undefined` |

### .namespace

Key prefix for namespace isolation. When set, all keys are prefixed with `namespace:`.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

### .namespaceSeparator

The separator between the namespace and key.

| Type | Default |
|---|---|
| `string` | `'::'` |

### .noNamespaceAffectsAll

With no namespace set, whether `clear()` and `iterator()` reach every key in etcd. When `false`, they only touch entries written without a namespace. It has no effect when a namespace is set.

| Type | Default |
|---|---|
| `boolean` | `false` |

## Methods

### constructor(url?, options?)

Creates a new `KeyvEtcd` instance.

- `url` — An etcd server URI string (e.g., `'etcd://localhost:2379'`) or a `KeyvEtcdOptions` object. Defaults to `'127.0.0.1:2379'` if not provided.
- `options` — Optional `KeyvEtcdOptions` object. When both `url` and `options` are objects, they are merged together.

```js
import KeyvEtcd from '@keyv/etcd';

// Using a URI string
const store = new KeyvEtcd('etcd://localhost:2379');

// Using an options object
const store2 = new KeyvEtcd({ url: '127.0.0.1:2379', ttl: 5000 });

// Using a URI string with additional options
const store3 = new KeyvEtcd('etcd://localhost:2379', { ttl: 5000 });
```

### .get(key)

Retrieves a value from the etcd server. Returns the stored value or `undefined` if the key does not exist.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
const result = await store.get('foo'); // 'bar'
```

### .getMany(keys)

Retrieves multiple values from the etcd server. Returns an array of stored data corresponding to each key.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.getMany(['key1', 'key2']);
```

### .set(key, value, expires?)

Stores a value in the etcd server. If `expires` is provided, a dedicated etcd lease (sized from the remaining time) is created for that key. Otherwise, a positive default `ttl` expires the key `ttl` milliseconds after this write, on its own lease. Returns `true` on success, `false` on failure.

> When you call the adapter directly, the third argument is an **absolute** `expires` timestamp (Unix ms since epoch), not a relative duration. Through Keyv (`keyv.set(key, value, ttl)`) you still pass a relative TTL — Keyv converts it to `expires` for you.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `expires` *(number, optional)* - Absolute expiry as Unix ms since epoch. `undefined` means no expiry.
- Returns: `Promise<boolean>`

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
await store.set('foo', 'bar', Date.now() + 5000); // expires in ~5 seconds
```

### .setMany(entries)

Stores multiple values in the etcd server. Each entry is a `KeyvStorageEntry<Value>` object (`{ key: string, value: Value, expires?: number }`) where `expires` is an absolute Unix ms timestamp, and `Value` is inferred from the entries provided. Returns a `boolean[]` indicating whether each entry was set successfully.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
const results = await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' },
]); // [true, true]
```

### .delete(key)

Deletes a key from the etcd server. Returns `true` if the key was deleted, `false` otherwise.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
const deleted = await store.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from the etcd server. Returns a `boolean[]` indicating whether each key was deleted.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.deleteMany(['key1', 'key2']); // [true, true]
```

### .clear()

Clears data from the etcd server. If a namespace is set, only keys with the namespace prefix are deleted. Otherwise only entries written without a namespace are deleted, and other namespaces' entries and other applications' keys stay. Set `noNamespaceAffectsAll` to `true` to delete every key in etcd instead. With no namespace, `clear()` reads every key in etcd, a page at a time, to find the entries to delete.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.clear();
```

### .has(key)

Checks whether a key exists in the etcd server.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
const exists = await store.has('foo'); // true
const missing = await store.has('baz'); // false
```

### .hasMany(keys)

Checks whether multiple keys exist in the etcd server. Returns an array of booleans corresponding to each key.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.hasMany(['key1', 'key2', 'key3']); // [true, true, false]
```

### .iterator()

Returns an async iterator over `[key, value]` pairs. If a namespace is set, only keys with that namespace are yielded and the namespace prefix is removed from the returned keys. The namespace does not need to be passed in — it uses the namespace configured on the adapter. With no namespace, only entries written without a namespace are yielded, unless `noNamespaceAffectsAll` is `true`, which yields every key in etcd. Expired entries are skipped and deleted.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('key1', 'value1');
await store.set('key2', 'value2');

for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Gracefully disconnects from the etcd server.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.disconnect();
```

### .formatKey(key)

Formats a key by prepending the namespace if one is set. A key that already starts with the namespace prefix gets it again, so `myapp:foo` and `foo` stay separate keys.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.formatKey('foo'); // 'foo'

store.namespace = 'myapp';
store.formatKey('foo'); // 'myapp:foo'
store.formatKey('myapp:foo'); // 'myapp:myapp:foo'
```

### .createKeyPrefix(key, namespace?)

Creates a prefixed key by prepending the namespace and separator. If no namespace is provided, the key is returned unchanged.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.createKeyPrefix('key', 'ns'); // 'ns::key'
store.createKeyPrefix('key'); // 'key'
```

### .removeKeyPrefix(key, namespace?)

Removes the namespace prefix from the start of a key. If no namespace is provided or the key does not start with the prefix, the key is returned unchanged.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.removeKeyPrefix('ns::key', 'ns'); // 'key'
store.removeKeyPrefix('key'); // 'key'
```

## License

[MIT © Jared Wray](LICENSE)
