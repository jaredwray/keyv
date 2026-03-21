# @keyv/etcd [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Etcd storage adapter for [Keyv](https://github.com/jaredwray/keyv) using the [etcd3](https://github.com/microsoft/etcd3) client

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/etcd.svg)](https://www.npmjs.com/package/@keyv/etcd)
[![npm](https://img.shields.io/npm/dm/@keyv/etcd)](https://npmjs.com/package/@keyv/etcd)

## Features

- Built on the [etcd3](https://github.com/microsoft/etcd3) package with full TypeScript support
- TTL support via etcd leases (millisecond input, converted to seconds internally)
- Namespace support for key isolation across multiple Keyv instances
- Async iterator support for scanning keys
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations
- `createKeyv` helper for quick setup

## Table of Contents

- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Options](#options)
- [Methods and Properties](#methods-and-properties)
  - [constructor(url?, options?)](#constructorurl-options)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value)](#setkey-value)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.iterator(namespace?)](#iteratornamespace)
  - [.disconnect()](#disconnect)
  - [.formatKey(key)](#formatkeykey)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/etcd
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

```js
import Keyv from 'keyv';
import KeyvEtcd from '@keyv/etcd';

const store = new KeyvEtcd('etcd://localhost:2379');
const keyv1 = new Keyv({ store, namespace: 'namespace1' });
const keyv2 = new Keyv({ store, namespace: 'namespace2' });

// keys are isolated by namespace
await keyv1.set('foo', 'bar1');
await keyv2.set('foo', 'bar2');

const value1 = await keyv1.get('foo'); // 'bar1'
const value2 = await keyv2.get('foo'); // 'bar2'
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'127.0.0.1:2379'` | The etcd server URL. The `etcd://` protocol prefix is automatically stripped. |
| `uri` | `string` | — | Alias for `url` |
| `ttl` | `number` | `undefined` | Default TTL in milliseconds for all keys. Uses etcd leases internally. |
| `busyTimeout` | `number` | `undefined` | Busy timeout in milliseconds |
| `dialect` | `string` | `'etcd'` | Storage dialect identifier (read-only) |
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

## Methods and Properties

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

### .set(key, value)

Stores a value in the etcd server. If a default TTL is configured via the `ttl` option, the value is stored with an etcd lease that expires automatically.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
```

### .setMany(entries)

Stores multiple values in the etcd server. Each entry is an object with `key` and `value` properties.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' },
]);
```

### .delete(key)

Deletes a key from the etcd server. Returns `true` if the key was deleted, `false` otherwise.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('foo', 'bar');
const deleted = await store.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from the etcd server. Returns `true` only if all keys were successfully deleted.

```js
const store = new KeyvEtcd('etcd://localhost:2379');
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const allDeleted = await store.deleteMany(['key1', 'key2']); // true
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

### .iterator(namespace?)

Returns an async iterator over key-value pairs. If a namespace is provided, only keys matching the namespace prefix are yielded.

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

## License

[MIT © Jared Wray](LICENSE)
