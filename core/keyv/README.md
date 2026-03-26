<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>

> Simple key-value storage with support for multiple backends

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![bun](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml)
[![browser](https://github.com/jaredwray/keyv/actions/workflows/browser-compat.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/browser-compat.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/dm/keyv.svg)](https://www.npmjs.com/package/keyv)
[![npm](https://img.shields.io/npm/v/keyv.svg)](https://www.npmjs.com/package/keyv)

Keyv provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL based expiry, making it suitable as a cache or a persistent key-value store.

# Features

There are a few existing modules similar to Keyv, however Keyv is different because it:

- Isn't bloated
- Has a simple Promise based API
- Suitable as a TTL based cache or persistent key-value store
- [Easily embeddable](#add-cache-support-to-your-module) inside another module
- Works with any storage that implements the [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) API
- Handles all JSON types plus `Buffer` and `BigInt` via the built-in `KeyvJsonSerializer`
- Supports namespaces
- Wide range of [**efficient, well tested**](#official-storage-adapters) storage adapters
- Connection errors are passed through (db failures won't kill your app)
- Supports the current active LTS version of Node.js or higher

# Table of Contents
- [Usage](#usage)
- [Type-safe Usage](#type-safe-usage)
- [Using Storage Adapters](#using-storage-adapters)
- [Namespaces](#namespaces)
- [Events](#events)
- [Hooks](#hooks)
- [Serialization](#serialization)
- [Official Storage Adapters](#official-storage-adapters)
- [Third-party Storage Adapters](#third-party-storage-adapters)
- [Using BigMap to Scale](#using-bigmap-to-scale)
- [Compression](#compression)
- [Capability Detection](#capability-detection)
- [API](#api)
  - [new Keyv([storage-adapter], [options]) or new Keyv([options])](#new-keyvstorage-adapter-options-or-new-keyvoptions)
  - [.namespace](#namespace)
  - [.ttl](#ttl)
  - [.store](#store)
  - [.serialization](#serialization-1)
  - [.compression](#compression)
  - [.useKeyPrefix](#usekeyprefix)
  - [.emitErrors](#emiterrors)
  - [.throwOnErrors](#throwonerrors)
  - [.stats](#stats)
  - [Keyv Instance](#keyv-instance)
	- [.set(key, value, [ttl])](#setkey-value-ttl)
	- [.setMany(entries)](#setmanyentries)
	- [.get(key, [options])](#getkey-options)
	- [.getMany(keys, [options])](#getmanykeys-options)
  - [.getRaw(key)](#getrawkey)
  - [.getManyRaw(keys)](#getmanyrawkeys)
  - [.setRaw(key, value)](#setrawkey-value)
  - [.setManyRaw(entries)](#setmanyrawentries)
	- [.delete(key)](#deletekey)
	- [.deleteMany(keys)](#deletemanykeys)
	- [.clear()](#clear)
	- [.has(key)](#haskey)
	- [.hasMany(keys)](#hasmanykeys)
	- [.disconnect()](#disconnect)
	- [.iterator()](#iterator)
- [Bun Support](#bun-support)
- [How to Contribute](#how-to-contribute)
- [License](#license)

# Usage

Install Keyv.

```
npm install --save keyv
```

By default everything is stored in memory, you can optionally also install a storage adapter.

```
npm install --save @keyv/redis
npm install --save @keyv/valkey
npm install --save @keyv/mongo
npm install --save @keyv/sqlite
npm install --save @keyv/postgres
npm install --save @keyv/mysql
npm install --save @keyv/etcd
npm install --save @keyv/memcache
npm install --save @keyv/dynamo
```

First, create a new Keyv instance. 

```js
import Keyv from 'keyv';
```

# Type-safe Usage

You can create a `Keyv` instance with a generic type to enforce type safety for the values stored. Additionally, both the `get` and `set` methods support specifying custom types for specific use cases.

## Example with Instance-level Generic Type:

```ts
const keyv = new Keyv<number>(); // Instance handles only numbers
await keyv.set('key1', 123);
const value = await keyv.get('key1'); // value is inferred as number
```

## Example with Method-level Generic Type:

You can also specify a type directly in the `get` or `set` methods, allowing flexibility for different types of values within the same instance.

```ts
const keyv = new Keyv(); // Generic type not specified at instance level

await keyv.set<string>('key2', 'some string'); // Method-level type for this value
const strValue = await keyv.get<string>('key2'); // Explicitly typed as string

await keyv.set<number>('key3', 456); // Storing a number in the same instance
const numValue = await keyv.get<number>('key3'); // Explicitly typed as number
```

This makes `Keyv` highly adaptable to different data types while maintaining type safety.

# Using Storage Adapters

Once you have created your Keyv instance you can use it as a simple key-value store with `in-memory` by default. To use a storage adapter, create an instance of the adapter and pass it to the Keyv constructor. Here are some examples:

```js
// redis
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
```

You can also pass in a storage adapter with other options such as `ttl` and `namespace` (example using `sqlite`):

```js
//sqlite
import KeyvSqlite from '@keyv/sqlite';

const keyvSqlite = new KeyvSqlite('sqlite://path/to/database.sqlite');
const keyv = new Keyv({ store: keyvSqlite, ttl: 5000, namespace: 'cache' });
```

To handle an event you can do the following:

```js
// Handle DB connection errors
keyv.on('error', err => console.log('Connection Error', err));
```

Now lets do an end-to-end example using `Keyv` and the `Redis` storage adapter:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyvRedis = new KeyvRedis('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: keyvRedis });

await keyv.set('foo', 'expires in 1 second', 1000); // true
await keyv.set('foo', 'never expires'); // true
await keyv.get('foo'); // 'never expires'
await keyv.delete('foo'); // true
await keyv.clear(); // undefined
```

It's is just that simple! Keyv is designed to be simple and easy to use.

# Namespaces

You can namespace your Keyv instance to avoid key collisions and allow you to clear only a certain namespace while using the same database.

```js
const users = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'), { namespace: 'users' });
const cache = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'), { namespace: 'cache' });

await users.set('foo', 'users'); // true
await cache.set('foo', 'cache'); // true
await users.get('foo'); // 'users'
await cache.get('foo'); // 'cache'
await users.clear(); // undefined
await users.get('foo'); // undefined
await cache.get('foo'); // 'cache'
```

# Events

Keyv is a custom `EventEmitter` and will emit an `'error'` event if there is an error.
If there is no listener for the `'error'` event, an uncaught exception will be thrown.
To disable the `'error'` event, pass `emitErrors: false` in the constructor options.

```js
const keyv = new Keyv({ emitErrors: false });
```

In addition it will emit `clear` and `disconnect` events when the corresponding methods are called.

```js
const keyv = new Keyv();
const handleConnectionError = err => console.log('Connection Error', err);
const handleClear = () => console.log('Cache Cleared');
const handleDisconnect = () => console.log('Disconnected');

keyv.on('error', handleConnectionError);
keyv.on('clear', handleClear);
keyv.on('disconnect', handleDisconnect);
```

# Hooks

Keyv supports hooks for `get`, `set`, and `delete` methods. Hooks are useful for logging, debugging, and other custom functionality. Here is a list of all the hooks:

```
PRE_GET
POST_GET
PRE_GET_RAW
POST_GET_RAW
PRE_GET_MANY
POST_GET_MANY
PRE_GET_MANY_RAW
POST_GET_MANY_RAW
PRE_SET
POST_SET
PRE_SET_RAW
POST_SET_RAW
PRE_SET_MANY_RAW
POST_SET_MANY_RAW
PRE_DELETE
POST_DELETE
```

You can access this by importing `KeyvHooks` from the main Keyv package.

```js
import Keyv, { KeyvHooks } from 'keyv';
```

## Get Hooks

The `POST_GET` and `POST_GET_RAW` hooks fire on both cache hits and misses. When a cache miss occurs (key doesn't exist or is expired), the hooks receive `undefined` as the value.

```js
// POST_GET hook - fires on both hits and misses
const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.POST_GET, (data) => {
  if (data.value === undefined) {
    console.log(`Cache miss for key: ${data.key}`);
  } else {
    console.log(`Cache hit for key: ${data.key}`, data.value);
  }
});

await keyv.get('existing-key'); // Logs cache hit with value
await keyv.get('missing-key');  // Logs cache miss with undefined
```

```js
// POST_GET_RAW hook - same behavior as POST_GET
const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.POST_GET_RAW, (data) => {
  console.log(`Key: ${data.key}, Value:`, data.value);
});

await keyv.getRaw('foo'); // Logs with value or undefined
```

## Set Hooks

```js
//PRE_SET hook
const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.PRE_SET, (data) => console.log(`Setting key ${data.key} to ${data.value}`));

//POST_SET hook
const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.POST_SET, ({key, value}) => console.log(`Set key ${key} to ${value}`));
```

In these examples you can also manipulate the value before it is set. For example, you could add a prefix to all keys.

```js
const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.PRE_SET, (data) => {
  console.log(`Manipulating key ${data.key} and ${data.value}`);
  data.key = `prefix-${data.key}`;
  data.value = `prefix-${data.value}`;
});
```

Now this key will have prefix- added to it before it is set.

## Delete Hooks

In `PRE_DELETE` and `POST_DELETE` hooks, the value could be a single item or an `Array`. This is based on the fact that `delete` can accept a single key or an `Array` of keys.


# Serialization

By default, Keyv uses its built-in `KeyvJsonSerializer` — a JSON-based serializer with support for `Buffer` and `BigInt` types. This works out of the box with all storage adapters.

## Official Serializers

In addition to the built-in serializer, Keyv offers two official serialization packages:

### SuperJSON

[`@keyv/serialize-superjson`](https://github.com/jaredwray/keyv/tree/main/serialization/superjson) supports `Date`, `RegExp`, `Map`, `Set`, `BigInt`, `undefined`, `Error`, and `URL` types.

```js
import Keyv from 'keyv';
import { superJsonSerializer } from '@keyv/serialize-superjson'; // using the helper function that does new KeyvSuperJsonSerializer()

const keyv = new Keyv({ serialization: superJsonSerializer });
```

### MessagePack (msgpackr)

[`@keyv/serialize-msgpackr`](https://github.com/jaredwray/keyv/tree/main/serialization/msgpackr) is a binary serializer that supports `Date`, `RegExp`, `Map`, `Set`, `Error`, `undefined`, `NaN`, and `Infinity` types.

```js
import Keyv from 'keyv';
import { KeyvMsgpackrSerializer } from '@keyv/serialize-msgpackr';

const keyv = new Keyv({ serialization: new KeyvMsgpackrSerializer() });
```

## Custom Serializers

You can provide your own serializer by implementing the `KeyvSerializationAdapter` interface with `stringify` and `parse` methods:

```typescript
interface KeyvSerializationAdapter {
  stringify: (object: unknown) => string | Promise<string>;
  parse: <T>(data: string) => T | Promise<T>;
}
```

## Disabling Serialization

You can disable serialization entirely by passing `false`. This stores data as raw objects, which works for in-memory `Map` storage where string conversion is not needed:

```js
const keyv = new Keyv({ serialization: false });
```

## Pipeline

When serialization and/or compression are configured, Keyv applies them in this order:

**On set:** serialize (optional) → compress (optional) → store

**On get:** store → decompress (optional) → parse (optional) → value

If compression is configured without a serializer, Keyv will use `JSON.stringify`/`JSON.parse` as a minimum fallback since compression adapters require string input.

# Official Storage Adapters

The official storage adapters are covered by [over 150 integration tests](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml) to guarantee consistent behaviour. They are lightweight, efficient wrappers over the DB clients making use of indexes and native TTLs where available.

Database | Adapter | Native TTL
---|---|---
Redis | [@keyv/redis](https://github.com/jaredwray/keyv/tree/master/storage/redis) | Yes
Valkey | [@keyv/valkey](https://github.com/jaredwray/keyv/tree/master/storage/valkey) | Yes
MongoDB | [@keyv/mongo](https://github.com/jaredwray/keyv/tree/master/storage/mongo) | Yes
SQLite | [@keyv/sqlite](https://github.com/jaredwray/keyv/tree/master/storage/sqlite) | No
PostgreSQL | [@keyv/postgres](https://github.com/jaredwray/keyv/tree/master/storage/postgres) | No
MySQL | [@keyv/mysql](https://github.com/jaredwray/keyv/tree/master/storage/mysql) | No
Etcd | [@keyv/etcd](https://github.com/jaredwray/keyv/tree/master/storage/etcd) | Yes
Memcache | [@keyv/memcache](https://github.com/jaredwray/keyv/tree/master/storage/memcache) | Yes
DynamoDB | [@keyv/dynamo](https://github.com/jaredwray/keyv/tree/master/storage/dynamo) | Yes

# Third-party Storage Adapters

We love the community and the third-party storage adapters they have built. They enable Keyv to be used with even more backends and use cases.

You can also use third-party storage adapters or build your own. Keyv will wrap these storage adapters in TTL functionality and handle complex types internally.

```js
import Keyv from 'keyv';
import myAdapter from 'my-adapter';

const keyv = new Keyv({ store: myAdapter });
```

Any store that follows the [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) api will work.

```js
new Keyv({ store: new Map() });
```

For example, [`quick-lru`](https://github.com/sindresorhus/quick-lru) is a completely unrelated module that implements the Map API.

```js
import Keyv from 'keyv';
import QuickLRU from 'quick-lru';

const lru = new QuickLRU({ maxSize: 1000 });
const keyv = new Keyv({ store: lru });
```

View the complete list of third-party storage adapters and learn how to build your own at https://keyv.org/docs/third-party-storage-adapters/

# Using BigMap to Scale

## Understanding JavaScript Map Limitations

JavaScript's built-in `Map` object has a practical limit of approximately **16.7 million entries** (2^24). When you try to store more entries than this limit, you'll encounter performance degradation or runtime errors. This limitation is due to how JavaScript engines internally manage Map objects.

For applications that need to cache millions of entries in memory, this becomes a significant constraint. Common scenarios include:
- High-traffic caching layers
- Session stores for large-scale applications
- In-memory data processing of large datasets
- Real-time analytics with millions of data points

## Why BigMap?

`@keyv/bigmap` solves this limitation by using a **distributed hash approach** with multiple internal Map instances. Instead of storing all entries in a single Map, BigMap distributes entries across multiple Maps using a hash function. This allows you to scale beyond the 16.7 million entry limit while maintaining the familiar Map API.

### Key Benefits:
- **Scales beyond Map limits**: Store 20+ million entries without issues
- **Map-compatible API**: Drop-in replacement for standard Map
- **Performance**: Uses efficient DJB2 hashing for fast key distribution
- **Type-safe**: Built with TypeScript and supports generics
- **Customizable**: Configure store size and hash functions

## Using BigMap with Keyv

BigMap can be used directly with Keyv as a storage adapter, providing scalable in-memory storage with full TTL support.

### Installation

```bash
npm install --save keyv @keyv/bigmap
```

### Basic Usage

The simplest way to use BigMap with Keyv is through the `createKeyv` helper function:

```js
import { createKeyv } from '@keyv/bigmap';

const keyv = createKeyv();

// Set values with TTL (time in milliseconds)
await keyv.set('user:1', { name: 'Alice', email: 'alice@example.com' }, 60000); // Expires in 60 seconds

// Get values
const user = await keyv.get('user:1');
console.log(user); // { name: 'Alice', email: 'alice@example.com' }

// Delete values
await keyv.delete('user:1');

// Clear all values
await keyv.clear();
```

For more details about BigMap, see the [@keyv/bigmap documentation](https://github.com/jaredwray/keyv/tree/main/core/bigmap).

# Compression

Keyv supports `gzip`, `brotli` and `lz4` compression. To enable compression, pass the `compress` option to the constructor.

```js
import Keyv from 'keyv';
import KeyvGzip from '@keyv/compress-gzip';

const keyvGzip = new KeyvGzip();
const keyv = new Keyv({ compression: keyvGzip });
```

```js
import Keyv from 'keyv';
import KeyvBrotli from '@keyv/compress-brotli';

const keyvBrotli = new KeyvBrotli();
const keyv = new Keyv({ compression: keyvBrotli });
```

```js
import Keyv from 'keyv';
import KeyvLz4 from '@keyv/compress-lz4';

const keyvLz4 = new KeyvLz4();
const keyv = new Keyv({ compression: keyvLz4 });
```

You can also pass a custom compression function to the `compression` option. Following the pattern of the official compression adapters.

## Want to build your own KeyvCompressionAdapter?

Great! Keyv is designed to be easily extended. You can build your own compression adapter by following the pattern of the official compression adapters based on this interface:

```typescript
interface KeyvCompressionAdapter {
	compress(value: any, options?: any): Promise<any>;
	decompress(value: any, options?: any): Promise<any>;
}
```

In addition to the interface, you can test it with our compression test suite using @keyv/test-suite:

```js
import { keyvCompressionTests } from '@keyv/test-suite';
import KeyvGzip from '@keyv/compress-gzip';

keyvCompressionTests(test, new KeyvGzip());
```

# Encryption

Keyv provides a `KeyvEncryptionAdapter` interface for encryption support. This interface is available for custom implementations but is not yet wired into the core pipeline.

```typescript
interface KeyvEncryptionAdapter {
  encrypt: (data: string) => string | Promise<string>;
  decrypt: (data: string) => string | Promise<string>;
}
```

# Capability Detection

Keyv exports helper functions to check whether an object implements the expected interface for a Keyv instance, storage adapter, compression adapter, serialization adapter, or encryption adapter. Each function returns an object with boolean flags for every capability, plus a top-level boolean indicating whether the object fully satisfies the interface.

```ts
import {
  isKeyv,
  isKeyvStorage,
  isKeyvCompression,
  isKeyvSerialization,
  isKeyvEncryption,
  checkCapabilities,
} from 'keyv';
```

## isKeyv(obj)

Returns an `IsKeyvResult` with a boolean for each Keyv method/property. The `keyv` flag is `true` only when **all** capabilities are present.

```ts
import Keyv, { isKeyv } from 'keyv';

isKeyv(new Keyv());
// { keyv: true, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: true, setMany: true, deleteMany: true, hasMany: true,
//   disconnect: true, getRaw: true, getManyRaw: true, setRaw: true,
//   setManyRaw: true, hooks: true, stats: true, iterator: true }

isKeyv(new Map());
// { keyv: false, get: true, set: true, ... }
```

## isKeyvStorage(obj)

Returns an `IsKeyvStorageResult`. The `keyvStorage` flag is `true` when the object has `get`, `set`, `delete`, `clear`, `has`, `setMany`, `deleteMany`, and `hasMany`.

The result also includes:
- **`isMapLike`** — `true` when the object has synchronous `get`, `set`, `delete`, `has`, `entries`, and `keys` methods (i.e. it behaves like a `Map`)
- **`methodTypes`** — a record mapping each method name to `"sync"`, `"async"`, or `"none"` (not present)

```ts
import { isKeyvStorage } from 'keyv';

// Map-like object
const result = isKeyvStorage(new Map());
result.isMapLike; // true
result.methodTypes.get; // "sync"
result.methodTypes.set; // "sync"

// Async storage adapter
const adapter = {
  get: async () => {}, set: async () => {}, delete: async () => {},
  clear: async () => {}, has: async () => {}, setMany: async () => {},
  deleteMany: async () => {}, hasMany: async () => {},
};
const adapterResult = isKeyvStorage(adapter);
adapterResult.keyvStorage; // true
adapterResult.isMapLike; // false
adapterResult.methodTypes.get; // "async"
```

## isKeyvCompression(obj)

Returns an `IsKeyvCompressionResult`. The `keyvCompression` flag is `true` when both `compress` and `decompress` methods are present.

```ts
import { isKeyvCompression } from 'keyv';

isKeyvCompression({ compress: (d) => d, decompress: (d) => d });
// { keyvCompression: true, compress: true, decompress: true }
```

## isKeyvSerialization(obj)

Returns an `IsKeyvSerializationResult`. The `keyvSerialization` flag is `true` when both `stringify` and `parse` methods are present.

```ts
import { isKeyvSerialization } from 'keyv';

isKeyvSerialization(JSON);
// { keyvSerialization: true, stringify: true, parse: true }
```

## isKeyvEncryption(obj)

Returns an `IsKeyvEncryptionResult`. The `keyvEncryption` flag is `true` when both `encrypt` and `decrypt` methods are present.

```ts
import { isKeyvEncryption } from 'keyv';

isKeyvEncryption({ encrypt: (d) => d, decrypt: (d) => d });
// { keyvEncryption: true, encrypt: true, decrypt: true }
```

## checkCapabilities(obj, spec)

A generic helper for building your own capability checks. Accepts a `CheckCapabilitiesSpec` describing which methods and properties to look for, which are required, and the name of the composite boolean key.

```ts
import { checkCapabilities } from 'keyv';

const result = checkCapabilities(myObject, {
  methods: ['read', 'write'],
  properties: ['name'],
  requiredKeys: ['read', 'write', 'name'],
  compositeKey: 'isValid',
});
// { isValid: true/false, read: true/false, write: true/false, name: true/false }
```

# API

## new Keyv([storage-adapter], [options]) or new Keyv([options])

Returns a new Keyv instance.

The Keyv instance is also an `EventEmitter` that will emit an `'error'` event if the storage adapter connection fails.

## storage-adapter

Type: `KeyvStorageAdapter`<br />
Default: `undefined`

The storage adapter instance to be used by Keyv.

## .namespace

Type: `String`
Default: `'keyv'`

This is the namespace for the current instance. When you set it it will set it also on the storage adapter.

## options

Type: `Object`

The options object is also passed through to the storage adapter. Check your storage adapter docs for any extra options.

## options.namespace

Type: `String`<br />
Default: `'keyv'`

Namespace for the current instance.

## options.ttl

Type: `Number`<br />
Default: `undefined`

Default TTL. Can be overridden by specififying a TTL on `.set()`.

## options.compression

Type: `KeyvCompressionAdapter`<br />
Default: `undefined`

Compression package to use. See [Compression](#compression) for more details.

## options.serialization

Type: `KeyvSerializationAdapter | false`<br />
Default: `KeyvJsonSerializer` (built-in)

A serialization object with `stringify` and `parse` methods. Set to `false` to disable serialization and store raw objects. See [Serialization](#serialization) for more details.

## options.store

Type: `Storage adapter instance`<br />
Default: `new Map()`

The storage adapter instance to be used by Keyv.

# Keyv Instance

Keys must always be strings. Values can be of any type.

## .set(key, value, [ttl])

Set a value.

By default keys are persistent. You can set an expiry TTL in milliseconds.

Returns a promise which resolves to `true`.

## .setMany(entries)

Set multiple values using `KeyvEntry<Value>` objects (`{ key: string, value: Value, ttl?: number }`). The `Value` type is inferred from the entries provided.

## .get(key, [options])

Returns a promise which resolves to the retrieved value.

## .getMany(keys, [options])

Returns a promise which resolves to an array of retrieved values.

## .getRaw(key)

Returns a promise which resolves to the raw stored data for the key or `undefined` if the key does not exist or is expired.

## .getManyRaw(keys)

Returns a promise which resolves to an array of raw stored data for the keys or `undefined` if the key does not exist or is expired.

## .setRaw(key, value)

Sets a raw value in the store without wrapping. This is the write-side counterpart to `.getRaw()`. The caller provides the `DeserializedData` envelope directly (`{ value, expires? }`) instead of having Keyv wrap it. The envelope is still serialized before storing so that all read paths (`get()`, `getRaw()`, `has()`, `getManyRaw()`) work consistently. If you need TTL-based expiration, set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`). The store-level TTL is derived automatically from `value.expires`.

Returns a promise which resolves to `true`.

```js
const keyv = new Keyv();

// Set a raw value with expiration
await keyv.setRaw('foo', { value: 'bar', expires: Date.now() + 60000 });

// Set a raw value without expiration
await keyv.setRaw('foo', { value: 'bar' });

// Round-trip: get raw, modify, set raw
const raw = await keyv.getRaw('foo');
if (raw) {
  raw.value = 'updated';
  await keyv.setRaw('foo', raw);
}
```

## .setManyRaw(entries)

Sets many raw values in the store without wrapping. Each entry should have a `key` and a `value` (`DeserializedData` envelope). Like `setRaw()`, the envelopes are serialized before storing and the store-level TTL is derived from each entry's `value.expires`.

Returns a promise which resolves to an array of booleans.

```js
const keyv = new Keyv();
await keyv.setManyRaw([
  { key: 'foo', value: { value: 'bar' } },
  { key: 'baz', value: { value: 'qux', expires: Date.now() + 60000 } },
]);
```

## .delete(key)

Deletes an entry.

Returns a promise which resolves to `true` if the key existed, `false` if not.

## .deleteMany(keys)
Deletes multiple entries.
Returns a promise which resolves to `true` if all keys were deleted successfully, `false` otherwise.

## .clear()

Delete all entries in the current namespace.

Returns a promise which is resolved when the entries have been cleared.

## .has(key)

Check if a key exists in the store.

Returns a promise which resolves to `true` if the key exists, `false` if not.

```js
await keyv.set('foo', 'bar');
await keyv.has('foo'); // true
await keyv.has('unknown'); // false
```

## .hasMany(keys)

Check if multiple keys exist in the store.

Returns a promise which resolves to an array of booleans indicating if each key exists.

```js
await keyv.set('foo', 'bar');
await keyv.hasMany(['foo', 'unknown']); // [true, false]
```

## .disconnect()

Disconnect from the storage adapter. Emits a `'disconnect'` event.

Returns a promise which is resolved when the connection has been closed.

```js
await keyv.disconnect();
```

## .iterator()

Iterate over all entries of the current namespace.

Returns a iterable that can be iterated by for-of loops. For example:

```js
// please note that the "await" keyword should be used here
for await (const [key, value] of this.keyv.iterator()) {
  console.log(key, value);
};
```

# API - Properties

## .namespace

Type: `String`

The namespace for the current instance. This will define the namespace for the current instance and the storage adapter. If you set the namespace to `undefined` it will no longer do key prefixing.

```js
const keyv = new Keyv({ namespace: 'my-namespace' });
console.log(keyv.namespace); // 'my-namespace'
```

here is an example of setting the namespace to `undefined`:

```js
const keyv = new Keyv();
console.log(keyv.namespace); // 'keyv' which is default
keyv.namespace = undefined;
console.log(keyv.namespace); // undefined
```

## .ttl

Type: `Number`<br />
Default: `undefined`

Default TTL. Can be overridden by specififying a TTL on `.set()`. If set to `undefined` it will never expire.

```js
const keyv = new Keyv({ ttl: 5000 });
console.log(keyv.ttl); // 5000
keyv.ttl = undefined;
console.log(keyv.ttl); // undefined (never expires)
```

## .store

Type: `Storage adapter instance`<br />
Default: `new Map()`

The storage adapter instance to be used by Keyv. This will wire up the iterator, events, and more when a set happens. If it is not a valid Map or Storage Adapter it will throw an error. 

```js
import KeyvSqlite from '@keyv/sqlite';
const keyv = new Keyv();
console.log(keyv.store instanceof Map); // true
keyv.store = new KeyvSqlite('sqlite://path/to/database.sqlite');
console.log(keyv.store instanceof KeyvSqlite); // true
```

## .serialization

Type: `KeyvSerializationAdapter | false | undefined`<br />
Default: `KeyvJsonSerializer` (built-in)

The serialization object used for storing and retrieving values. Set to `false` or `undefined` to disable serialization and use raw object pass-through. See [Serialization](#serialization) for more details.

```js
const keyv = new Keyv();
console.log(keyv.serialization); // KeyvJsonSerializer (default)
keyv.serialization = false; // disable serialization
console.log(keyv.serialization); // undefined
```

## .compression

Type: `KeyvCompressionAdapter`<br />
Default: `undefined`

This is the compression package to use. See [Compression](#compression) for more details. If it is undefined it will not compress (default).

```js
import KeyvGzip from '@keyv/compress-gzip';

const keyv = new Keyv();
console.log(keyv.compression); // undefined
keyv.compression = new KeyvGzip();
console.log(keyv.compression); // KeyvGzip
```

## .useKeyPrefix

Type: `Boolean`<br />
Default: `true`

If set to `true` Keyv will prefix all keys with the namespace. This is useful if you want to avoid collisions with other data in your storage.

```js
const keyv = new Keyv({ useKeyPrefix: false });
console.log(keyv.useKeyPrefix); // false
keyv.useKeyPrefix = true;
console.log(keyv.useKeyPrefix); // true
```

With many of the storage adapters you will also need to set the `namespace` option to `undefined` to have it work correctly. This is because in `v5` we started the transition to having the storage adapter handle the namespacing and `Keyv` will no longer handle it internally via KeyPrefixing. Here is an example of doing ith with `KeyvSqlite`:

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const store = new KeyvSqlite('sqlite://path/to/database.sqlite');
const keyv = new Keyv({ store });
keyv.useKeyPrefix = false; // disable key prefixing
store.namespace = undefined; // disable namespacing in the storage adapter

await keyv.set('foo', 'bar'); // true
await keyv.get('foo'); // 'bar'
await keyv.clear();
```

## .emitErrors

Type: `Boolean`<br />
Default: `true`

If set to `true`, Keyv will emit an `'error'` event when an error occurs. Set to `false` to suppress error events.

```js
const keyv = new Keyv({ emitErrors: false });
console.log(keyv.emitErrors); // false
keyv.emitErrors = true;
console.log(keyv.emitErrors); // true
```

## .throwOnErrors

Type: `Boolean`<br />
Default: `false`

If set to `true`, Keyv will throw an error if any operation fails. This is useful if you want to ensure that all operations are successful and you want to handle errors.

```js
const keyv = new Keyv({ throwOnErrors: true });
console.log(keyv.throwOnErrors); // true
keyv.throwOnErrors = false;
console.log(keyv.throwOnErrors); // false
```

A good example of this is with the `@keyv/redis` storage adapter. If you want to handle connection errors, retries, and timeouts more gracefully, you can use the `throwOnErrors` option. This will throw an error if any operation fails, allowing you to catch it and handle it accordingly:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

// create redis instance that will throw on connection error
const keyvRedis = new KeyvRedis('redis://user:pass@localhost:6379', { throwOnConnectErrors: true });

const keyv = new Keyv({ store: keyvRedis, throwOnErrors: true });
```

What this does is it only throw on connection errors with the Redis client.

## .stats
Type: `StatsManager`<br />
Default: `StatsManager` instance with `enabled: false`

The stats property provides access to statistics tracking for cache operations. When enabled via the `stats` option during initialization, it tracks hits, misses, sets, deletes, and errors.

### Enabling Stats:
```js
const keyv = new Keyv({ stats: true });
console.log(keyv.stats.enabled); // true
```

### Available Statistics:
- `hits`: Number of successful cache retrievals
- `misses`: Number of failed cache retrievals
- `sets`: Number of set operations
- `deletes`: Number of delete operations
- `errors`: Number of errors encountered

### Accessing Stats:
```js
const keyv = new Keyv({ stats: true });

await keyv.set('foo', 'bar');
await keyv.get('foo'); // cache hit
await keyv.get('nonexistent'); // cache miss
await keyv.delete('foo');

console.log(keyv.stats.hits);    // 1
console.log(keyv.stats.misses);  // 1
console.log(keyv.stats.sets);    // 1
console.log(keyv.stats.deletes); // 1
```

### Resetting Stats:
```js
keyv.stats.reset();
console.log(keyv.stats.hits); // 0
```

### Manual Control:
You can also manually enable/disable stats tracking at runtime:
```js
const keyv = new Keyv({ stats: false });
keyv.stats.enabled = true; // Enable stats tracking
// ... perform operations ...
keyv.stats.enabled = false; // Disable stats tracking
```

# Bun Support

We make a best effort to support [Bun](https://bun.sh/) as a runtime. Our default and primary target is Node.js, but we run tests against Bun to ensure compatibility. If you encounter any issues while using Keyv with Bun, please report them at our [GitHub issues](https://github.com/jaredwray/keyv/issues).

# How to Contribute

We welcome contributions to Keyv! 🎉 Here are some guides to get you started with contributing:

* [Contributing](https://github.com/jaredwray/keyv/blob/main/CONTRIBUTING.md) - Learn about how to contribute to Keyv
* [Code of Conduct](https://github.com/jaredwray/keyv/blob/main/CODE_OF_CONDUCT.md) - Learn about the Keyv Code of Conduct
* [How to Contribute](https://github.com/jaredwray/keyv/blob/main/README.md) - How do develop in the Keyv mono repo! 

# License

[MIT © Jared Wray](LICENSE)
