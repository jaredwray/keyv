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

- **etcd v3 or newer** — this adapter uses the etcd v3 API (`/v3/kv/range`, `/v3/kv/put`, `/v3/lease/grant`, etc.) exposed by etcd's built-in HTTP/JSON gateway. etcd v2 is not supported.
- **Node.js 20 or newer** — the client uses the global `fetch` and `AbortSignal.timeout` APIs.

## Table of Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Options](#options)
- [Properties](#properties)
  - [.client](#client)
  - [.lease](#lease)
  - [.url](#url)
  - [.ttl](#ttl)
  - [.busyTimeout](#busytimeout)
  - [.namespace](#namespace)
  - [.keyPrefixSeparator](#keyprefixseparator)
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

You also need a running etcd v3+ server reachable from your Node process. For local development:

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

// clear all values
await keyv.clear();

// disconnect
await store.disconnect();
```

## Usage with Namespaces

Namespacing is handled natively by the adapter — keys are prefixed with the namespace and separator (`namespace:key`) before being written to etcd, and the prefix is stripped from keys returned by `iterator()`. Setting a `namespace` on a `Keyv` instance propagates it to the underlying store automatically. Use a separate store instance per namespace so each keeps its own prefix:

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

You can also set the namespace directly on the store:

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.namespace = 'myapp';

await store.set('foo', 'bar'); // stored as 'myapp:foo'
await store.get('foo'); // 'bar'
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'127.0.0.1:2379'` | The etcd server URL. The `etcd://` protocol prefix is automatically stripped. |
| `uri` | `string` | — | Alias for `url` |
| `ttl` | `number` | `undefined` | Default TTL in milliseconds for all keys. Uses etcd leases internally. |
| `busyTimeout` | `number` | `undefined` | Per-request timeout in milliseconds. Aborts hung requests via `AbortSignal.timeout`. |
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation |

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

### .lease

The etcd lease used for TTL support. Only set when a `ttl` is configured.

| Type | Default |
|---|---|
| `Lease \| undefined` | `undefined` |

### .url

The etcd server URL.

| Type | Default |
|---|---|
| `string` | `'127.0.0.1:2379'` |

### .ttl

Default TTL in milliseconds for all keys. Converted to seconds internally for etcd leases.

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

### .keyPrefixSeparator

The separator between the namespace and key.

| Type | Default |
|---|---|
| `string` | `':'` |

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

Stores a value in the etcd server. If `expires` is provided, a dedicated etcd lease (sized from the remaining time) is created for that key. Otherwise, if a default TTL is configured via the constructor `ttl` option, the shared lease is used. Returns `true` on success, `false` on failure.

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

Clears data from the etcd server. If a namespace is set, only keys with the namespace prefix are deleted. Otherwise, all keys are deleted.

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

Returns an async iterator over `[key, value]` pairs. If a namespace is set, only keys with that namespace are yielded and the namespace prefix is removed from the returned keys. The namespace does not need to be passed in — it uses the namespace configured on the adapter. Expired entries are skipped and deleted.

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

Formats a key by prepending the namespace if one is set. If the key already starts with the namespace prefix, it is returned as-is to avoid double-prefixing.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.formatKey('foo'); // 'foo'

store.namespace = 'myapp';
store.formatKey('foo'); // 'myapp:foo'
store.formatKey('myapp:foo'); // 'myapp:foo' (no double-prefix)
```

### .createKeyPrefix(key, namespace?)

Creates a prefixed key by prepending the namespace and separator. If no namespace is provided, the key is returned unchanged.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.createKeyPrefix('key', 'ns'); // 'ns:key'
store.createKeyPrefix('key'); // 'key'
```

### .removeKeyPrefix(key, namespace?)

Removes the namespace prefix from a key. If no namespace is provided, the key is returned unchanged.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
store.removeKeyPrefix('ns:key', 'ns'); // 'key'
store.removeKeyPrefix('key'); // 'key'
```

## License

[MIT © Jared Wray](LICENSE)
