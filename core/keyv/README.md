<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>

> Simple key-value storage with support for multiple backends

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![bun](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml)
[![browser](https://github.com/jaredwray/keyv/actions/workflows/browser-compat.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/browser-compat.yaml)
[![](https://data.jsdelivr.com/v1/package/npm/keyv/badge)](https://www.jsdelivr.com/package/npm/keyv)
[![codecov](https://codecov.io/gh/jaredwray/keyv/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
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
  - [.compression](#compression-1)
  - [.encryption](#encryption-1)
  - [.throwOnErrors](#throwonerrors)
  - [.checkExpired](#checkexpired)
  - [.stats](#stats)
  - [.sanitize](#sanitize)
  - [Keyv Instance](#keyv-instance)
	- [.set(key, value, [ttl])](#setkey-value-ttl)
	- [.setMany(entries)](#setmanyentries)
	- [.get(key)](#getkey)
	- [.getMany(keys)](#getmanykeys)
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

Keyv is an `EventEmitter` (built on [hookified](https://github.com/jaredwray/hookified)) and will emit an `'error'` event if there is an error. By default an error is only thrown if there are no listeners attached to the `'error'` event. To always throw on errors regardless of listeners, enable the [`throwOnErrors`](#throwonerrors) option.

```js
const keyv = new Keyv();
keyv.on('error', err => console.log('Connection Error', err));
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

Keyv supports hooks for all of its operations. Hooks are useful for logging, debugging, and other custom functionality. Each operation fires a `BEFORE_*` hook before it runs and an `AFTER_*` hook after it completes. Here is the list of all the hooks:

```
BEFORE_GET            / AFTER_GET
BEFORE_GET_MANY       / AFTER_GET_MANY
BEFORE_GET_RAW        / AFTER_GET_RAW
BEFORE_GET_MANY_RAW   / AFTER_GET_MANY_RAW
BEFORE_SET            / AFTER_SET
BEFORE_SET_RAW        / AFTER_SET_RAW
BEFORE_SET_MANY       / AFTER_SET_MANY
BEFORE_SET_MANY_RAW   / AFTER_SET_MANY_RAW
BEFORE_DELETE         / AFTER_DELETE
BEFORE_DELETE_MANY    / AFTER_DELETE_MANY
BEFORE_HAS            / AFTER_HAS
BEFORE_HAS_MANY       / AFTER_HAS_MANY
BEFORE_CLEAR          / AFTER_CLEAR
BEFORE_DISCONNECT     / AFTER_DISCONNECT
```

> The older `PRE_*` / `POST_*` hook names (e.g. `PRE_GET`, `POST_SET`) are deprecated aliases that still fire for backward compatibility. Prefer the `BEFORE_*` / `AFTER_*` names going forward.

You can access these by importing `KeyvHooks` from the main Keyv package and registering a handler with `onHook()`:

```js
import Keyv, { KeyvHooks } from 'keyv';

const keyv = new Keyv();
keyv.onHook(KeyvHooks.BEFORE_SET, (data) => {
  console.log(`Setting key ${data.key} to ${data.value}`);
});
```

## Get Hooks

The `AFTER_GET` and `AFTER_GET_RAW` hooks fire on both cache hits and misses. When a cache miss occurs (key doesn't exist or is expired), the hook receives `undefined` as the value.

```js
// AFTER_GET hook - fires on both hits and misses
const keyv = new Keyv();
keyv.onHook(KeyvHooks.AFTER_GET, (data) => {
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
// AFTER_GET_RAW hook - same behavior as AFTER_GET
const keyv = new Keyv();
keyv.onHook(KeyvHooks.AFTER_GET_RAW, (data) => {
  console.log(`Key: ${data.key}, Value:`, data.value);
});

await keyv.getRaw('foo'); // Logs with value or undefined
```

## Set Hooks

```js
// BEFORE_SET hook
const keyv = new Keyv();
keyv.onHook(KeyvHooks.BEFORE_SET, (data) => console.log(`Setting key ${data.key} to ${data.value}`));

// AFTER_SET hook
const keyv = new Keyv();
keyv.onHook(KeyvHooks.AFTER_SET, ({ key, value }) => console.log(`Set key ${key} to ${value}`));
```

In the `BEFORE_SET` hook you can also manipulate the value before it is set. For example, you could add a prefix to all keys.

```js
const keyv = new Keyv();
keyv.onHook(KeyvHooks.BEFORE_SET, (data) => {
  console.log(`Manipulating key ${data.key} and ${data.value}`);
  data.key = `prefix-${data.key}`;
  data.value = `prefix-${data.value}`;
});
```

Now this key will have `prefix-` added to it before it is set.

## Delete Hooks

In the `BEFORE_DELETE` and `AFTER_DELETE` hooks, the value could be a single item or an `Array`. This is based on the fact that `delete` can accept a single key or an `Array` of keys.


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

When serialization, compression, and/or encryption are configured, Keyv applies them in this order:

**On set:** serialize → compress (optional) → encrypt (optional) → store

**On get:** store → decrypt (optional) → decompress (optional) → parse → value

Compression and encryption operate on the serialized string, so they only run when a serializer is configured. The built-in `KeyvJsonSerializer` is enabled by default, so this works out of the box. If you disable serialization with `serialization: false`, values are passed through to the store as-is and compression/encryption are skipped.

# Official Storage Adapters

The official storage adapters are covered by [over 150 integration tests](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml) to guarantee consistent behaviour. They are lightweight, efficient wrappers over the DB clients making use of indexes and native TTLs where available.

Database | Adapter | Native TTL
---|---|---
Redis | [@keyv/redis](https://github.com/jaredwray/keyv/tree/main/storage/redis) | Yes
Valkey | [@keyv/valkey](https://github.com/jaredwray/keyv/tree/main/storage/valkey) | Yes
MongoDB | [@keyv/mongo](https://github.com/jaredwray/keyv/tree/main/storage/mongo) | Yes
SQLite | [@keyv/sqlite](https://github.com/jaredwray/keyv/tree/main/storage/sqlite) | No
PostgreSQL | [@keyv/postgres](https://github.com/jaredwray/keyv/tree/main/storage/postgres) | No
MySQL | [@keyv/mysql](https://github.com/jaredwray/keyv/tree/main/storage/mysql) | No
Etcd | [@keyv/etcd](https://github.com/jaredwray/keyv/tree/main/storage/etcd) | Yes
Memcache | [@keyv/memcache](https://github.com/jaredwray/keyv/tree/main/storage/memcache) | Yes
DynamoDB | [@keyv/dynamo](https://github.com/jaredwray/keyv/tree/main/storage/dynamo) | Yes

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

## Storage Adapter Contract (v6)

> The public API above is unchanged — `keyv.set(key, value, ttl)` still takes a relative TTL in milliseconds. The change below only affects authors of custom **storage adapters**.

As of v6, Keyv passes an **absolute `expires`** timestamp (Unix ms since epoch) to a storage adapter's write methods instead of a relative TTL. Keyv computes `expires` once, so adapters never need to derive or parse it:

```ts
import { keyvStorageCapability } from 'keyv';

type KeyvStorageEntry<Value> = { key: string; value: Value; expires?: number };

class MyAdapter {
  // Declare support for the absolute-`expires` contract:
  get capabilities() {
    return keyvStorageCapability(this); // -> { ...detected, expires: true }
  }

  // `expires` is absolute Unix ms; `undefined` means no expiry; `<= Date.now()` means already expired.
  async set(key: string, value: unknown, expires?: number): Promise<boolean> { /* ... */ }
  async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> { /* ... */ }
  // ...get, delete, clear, has, getMany, deleteMany, hasMany, etc.
}
```

A v6 adapter declares `capabilities.expires === true` (the `keyvStorageCapability(this)` helper sets it for you). Keyv then passes the absolute `expires` to it directly. Any **legacy** storage adapter that does *not* declare `capabilities.expires` is treated as a relative-TTL adapter and transparently wrapped by [`KeyvBridgeAdapter`](#third-party-storage-adapters), which converts the absolute `expires` back to a TTL (`Math.max(0, expires - Date.now())`) before delegating — so existing third-party adapters keep working unchanged. Stores that expose absolute-expiry primitives (e.g. Redis `PXAT`) use `expires` directly. Map-like stores wrapped via `new Keyv({ store: new Map() })` are unaffected.

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

Keyv supports pluggable encryption of stored values via the `KeyvEncryptionAdapter` interface. Pass an adapter with `encrypt` and `decrypt` methods using the `encryption` option (or set the [`.encryption`](#encryption-1) property). Encryption runs on the serialized (and optionally compressed) value, so it requires a serializer — the built-in `KeyvJsonSerializer` is enabled by default.

```typescript
interface KeyvEncryptionAdapter {
  encrypt: (data: string) => string | Promise<string>;
  decrypt: (data: string) => string | Promise<string>;
}
```

```js
import Keyv from 'keyv';

const encryption = {
  encrypt: async (data) => Buffer.from(data).toString('base64'),
  decrypt: async (data) => Buffer.from(data, 'base64').toString('utf8'),
};

const keyv = new Keyv({ encryption });
await keyv.set('foo', 'bar'); // value is encrypted at rest
await keyv.get('foo'); // 'bar'
```

# Capability Detection

Keyv exports helper functions to check whether an object implements the expected interface for a Keyv instance, storage adapter, compression adapter, serialization adapter, or encryption adapter. Each function returns an object with a top-level `compatible` boolean (whether the object fully satisfies the interface) plus a `methods` record describing every method it looked for.

```ts
import {
  detectKeyv,
  detectKeyvStorage,
  detectKeyvCompression,
  detectKeyvSerialization,
  detectKeyvEncryption,
} from 'keyv';
```

Every entry in the `methods` record has the shape `{ exists: boolean, methodType: "sync" | "async" | "none" }`.

## detectKeyv(obj)

Returns a `KeyvCapability`: `{ compatible, methods, properties }`. `compatible` is `true` only when **all** Keyv methods and properties are present.

```ts
import Keyv, { detectKeyv } from 'keyv';

const result = detectKeyv(new Keyv());
result.compatible;              // true — all capabilities present
result.methods.get.exists;      // true
result.methods.get.methodType;  // "async"
result.properties.hooks;        // true
result.properties.stats;        // true

const partial = detectKeyv(new Map());
partial.compatible;             // false — missing getMany, setMany, hooks, stats, etc.
partial.methods.get.exists;     // true
```

## detectKeyvStorage(obj)

Returns a `KeyvStorageCapability`: `{ compatible, store, methods }`. `compatible` is `true` when the object is a usable storage adapter, and `store` reports the detected kind:

- **`"keyvStorage"`** — implements the full async storage adapter interface (`get`, `set`, `delete`, `clear`, `has`, `setMany`, `deleteMany`, `hasMany`, all async)
- **`"mapLike"`** — has synchronous `get`, `set`, `delete`, and `has` (i.e. it behaves like a `Map`)
- **`"asyncMap"`** — has at least async `get`, `set`, `delete`, and `clear`
- **`"none"`** — not a usable store

```ts
import { detectKeyvStorage } from 'keyv';

// Map-like object
const map = detectKeyvStorage(new Map());
map.compatible;              // true
map.store;                   // "mapLike"
map.methods.get.methodType;  // "sync"

// Async storage adapter
const adapter = {
  get: async () => {}, set: async () => {}, delete: async () => {},
  clear: async () => {}, has: async () => {}, setMany: async () => {},
  deleteMany: async () => {}, hasMany: async () => {},
};
const adapterResult = detectKeyvStorage(adapter);
adapterResult.compatible;             // true
adapterResult.store;                  // "keyvStorage"
adapterResult.methods.get.methodType; // "async"
```

## detectKeyvCompression(obj)

Returns a `KeyvCompressionCapability`: `{ compatible, methods }`. `compatible` is `true` when both `compress` and `decompress` methods are present.

```ts
import { detectKeyvCompression } from 'keyv';

const result = detectKeyvCompression({ compress: (d) => d, decompress: (d) => d });
result.compatible;                // true
result.methods.compress.exists;   // true
result.methods.decompress.exists; // true
```

## detectKeyvSerialization(obj)

Returns a `KeyvSerializationCapability`: `{ compatible, methods }`. `compatible` is `true` when both `stringify` and `parse` methods are present.

```ts
import { detectKeyvSerialization } from 'keyv';

const result = detectKeyvSerialization(JSON);
result.compatible;               // true
result.methods.stringify.exists; // true
result.methods.parse.exists;     // true
```

## detectKeyvEncryption(obj)

Returns a `KeyvEncryptionCapability`: `{ compatible, methods }`. `compatible` is `true` when both `encrypt` and `decrypt` methods are present.

```ts
import { detectKeyvEncryption } from 'keyv';

const result = detectKeyvEncryption({ encrypt: (d) => d, decrypt: (d) => d });
result.compatible;              // true
result.methods.encrypt.exists;  // true
result.methods.decrypt.exists;  // true
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
Default: `undefined`

This is the namespace for the current instance. When you set it it will set it also on the storage adapter.

## options

Type: `Object`

The options object is also passed through to the storage adapter. Check your storage adapter docs for any extra options.

## options.namespace

Type: `String`<br />
Default: `undefined`

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

## options.stats

Type: `Boolean`<br />
Default: `false`

Enable statistics tracking (hits, misses, sets, deletes, errors). See [.stats](#stats) for details.

## options.throwOnErrors

Type: `Boolean`<br />
Default: `false`

Throw on all errors instead of only when there are no `'error'` listeners. See [.throwOnErrors](#throwonerrors) for details.

## options.sanitize

Type: `KeyvSanitizeOptions`<br />
Default: `undefined`

Enable sanitization of keys and namespaces by stripping dangerous patterns. See [.sanitize](#sanitize) for details.

## options.encryption

Type: `KeyvEncryptionAdapter`<br />
Default: `undefined`

Encryption adapter used to encrypt and decrypt stored values. See [Encryption](#encryption) for details.

## options.checkExpired

Type: `Boolean`<br />
Default: `false`

When `true`, Keyv checks expiry at its own layer on `get`/`getMany`/`has`/`hasMany` instead of trusting the storage adapter. See [.checkExpired](#checkexpired) for details.

# Keyv Instance

Keys must always be strings. Values can be of any type.

## .set(key, value, [ttl])

Set a value.

By default keys are persistent. You can set an expiry TTL in milliseconds.

Returns a promise which resolves to `true`.

## .setMany(entries)

Set multiple values using `KeyvEntry<Value>` objects (`{ key: string, value: Value, ttl?: number }`). The `Value` type is inferred from the entries provided.

## .get(key)

Returns a promise which resolves to the retrieved value, or `undefined` if the key does not exist or is expired. If an array of keys is passed it delegates to `.getMany()` and resolves to an array of values.

## .getMany(keys)

Returns a promise which resolves to an array of retrieved values, with `undefined` for keys that do not exist or are expired.

## .getRaw(key)

Returns a promise which resolves to the raw stored data for the key or `undefined` if the key does not exist or is expired.

## .getManyRaw(keys)

Returns a promise which resolves to an array of raw stored data for the keys or `undefined` if the key does not exist or is expired.

## .setRaw(key, value)

Sets a raw value in the store without wrapping. This is the write-side counterpart to `.getRaw()`. The caller provides the `KeyvValue` envelope directly (`{ value, expires? }`) instead of having Keyv wrap it. The envelope is still serialized before storing so that all read paths (`get()`, `getRaw()`, `has()`, `getManyRaw()`) work consistently. If you need TTL-based expiration, set `expires` on the value directly (e.g. `{ value: 'bar', expires: Date.now() + 60000 }`). The store-level TTL is derived automatically from `value.expires`.

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

Sets many raw values in the store without wrapping. Each entry should have a `key` and a `value` (`KeyvValue` envelope). Like `setRaw()`, the envelopes are serialized before storing and the store-level TTL is derived from each entry's `value.expires`.

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

Iterate over all key-value pairs in the store. Automatically deserializes values, filters out expired entries, and deletes them.

Returns an async generator that yields `[key, value]` pairs. Use with `for await...of`:

```js
for await (const [key, value] of keyv.iterator()) {
  console.log(key, value);
}
```

The iterator works with any storage backend:
- **Map stores**: iterates using the built-in `Symbol.iterator`
- **Storage adapters**: delegates to the adapter's `iterator()` method (e.g., Redis SCAN, SQL cursor)
- **Unsupported stores**: yields nothing if the store does not support iteration

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
console.log(keyv.namespace); // undefined which is default
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

## .encryption

Type: `KeyvEncryptionAdapter`<br />
Default: `undefined`

The encryption adapter used to encrypt and decrypt stored values. If `undefined` (default) values are not encrypted. See [Encryption](#encryption) for more details.

```js
const keyv = new Keyv();
console.log(keyv.encryption); // undefined
keyv.encryption = {
  encrypt: async (data) => Buffer.from(data).toString('base64'),
  decrypt: async (data) => Buffer.from(data, 'base64').toString('utf8'),
};
console.log(keyv.encryption); // the encryption adapter
```

## .checkExpired

Type: `Boolean`<br />
Default: `false`

A read-only property (configured via the `checkExpired` constructor option). When `true`, Keyv checks expiry at its own layer on `get`, `getMany`, `has`, and `hasMany`, deleting any expired entries it encounters. When `false` (default) it trusts the storage adapter to handle expiry.

```js
const keyv = new Keyv({ checkExpired: true });
console.log(keyv.checkExpired); // true
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
Type: `KeyvStats`<br />
Default: `KeyvStats` instance with `enabled: false`

The stats property provides access to statistics tracking for cache operations. When enabled via the `stats` option during initialization, it tracks hits, misses, sets, deletes, and errors. It also maintains LRU-bounded per-key frequency maps for each event type, allowing you to see which keys are accessed most.

### Enabling Stats:
```js
const keyv = new Keyv({ stats: true });
console.log(keyv.stats.enabled); // true
```

### Available Statistics:

**Aggregate counters:**
- `hits`: Number of successful cache retrievals
- `misses`: Number of failed cache retrievals
- `sets`: Number of set operations
- `deletes`: Number of delete operations
- `errors`: Number of errors encountered

**Per-key LRU frequency maps** (each capped at `maxEntries`, default 1000):
- `hitKeys`: `Map<string, number>` — key to hit count
- `missKeys`: `Map<string, number>` — key to miss count
- `setKeys`: `Map<string, number>` — key to set count
- `deleteKeys`: `Map<string, number>` — key to delete count
- `errorKeys`: `Map<string, number>` — key to error count

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

// Per-key frequency maps
console.log(keyv.stats.hitKeys.get('foo'));          // 1
console.log(keyv.stats.missKeys.get('nonexistent')); // 1
```

### Resetting Stats:
```js
keyv.stats.reset();
console.log(keyv.stats.hits); // 0
console.log(keyv.stats.hitKeys.size); // 0
```

### Manual Control:
You can also manually enable/disable stats tracking at runtime. Disabling stats will automatically unsubscribe from events:
```js
const keyv = new Keyv({ stats: false });
keyv.stats.enabled = true; // Enable stats tracking
// ... perform operations ...
keyv.stats.enabled = false; // Disable stats tracking and unsubscribe
```

### Standalone Usage:
You can create a `KeyvStats` instance independently and subscribe it to a Keyv instance:
```js
import { KeyvStats } from 'keyv';

const stats = new KeyvStats({ enabled: true, maxEntries: 500, emitter: keyv });
```

## .sanitize
Type: `KeyvSanitize` (configured via the `sanitize` option: `KeyvSanitizeOptions`)<br />
Default: disabled

The `.sanitize` property is a `KeyvSanitize` adapter. It is configured through the `sanitize` constructor option (`true`, or a `KeyvSanitizeOptions` object) and disabled by default.

It detects and strips dangerous patterns from keys and namespaces to protect against SQL injection, MongoDB operator injection, path traversal, and control character attacks. Harmless characters like quotes, slashes, and dollar signs pass through unchanged — only dangerous *patterns* are stripped.

Results are cached in an LRU cache (10,000 entries) for fast repeated lookups.

### Pattern Categories

| Category | Patterns Stripped | Purpose |
|----------|------------------|---------|
| `sql` | `;` `--` `/*` | Prevents SQL injection |
| `mongo` | leading `$`, `{$` sequences | Prevents MongoDB operator injection |
| `escape` | `\0` `\r` `\n` | Strips null bytes, CRLF injection |
| `path` | `../` `..\` | Prevents path traversal |

### Targets

| Target | Default | Description |
|--------|---------|-------------|
| `keys` | `true` (when enabled) | Sanitize keys on all operations |
| `namespace` | `true` (when enabled) | Sanitize namespace on construction and setter |

### Usage

Enable all sanitization:
```js
const keyv = new Keyv({ sanitize: true });
await keyv.set("test; DROP TABLE", "value");
// Key is stored as "test DROP TABLE"

// Harmless characters pass through
await keyv.set("user's-data", "value");
// Key is stored as "user's-data" (unchanged)
```

Disable all sanitization (default):
```js
const keyv = new Keyv({ sanitize: false });
```

Granular control per target and category:
```js
const keyv = new Keyv({
  sanitize: {
    keys: { sql: true, mongo: false },     // only SQL patterns on keys
    namespace: { path: true, sql: false },  // only path patterns on namespace
  }
});
```

Disable namespace sanitization only:
```js
const keyv = new Keyv({
  sanitize: { keys: true, namespace: false }
});
```

Change at runtime by updating the options on the existing adapter, or by replacing it:
```js
import { KeyvSanitize } from 'keyv';

// Update options on the existing adapter
keyv.sanitize.updateOptions({ keys: true, namespace: true });   // enable all
keyv.sanitize.updateOptions({ keys: { sql: true, mongo: false } }); // granular

// Or replace the adapter entirely
keyv.sanitize = new KeyvSanitize({ keys: true, namespace: true });
```

Sanitization is applied to all key-accepting methods: `get`, `set`, `delete`, `has`, `getMany`, `setMany`, `deleteMany`, `hasMany`, `getRaw`, `getManyRaw`, `setRaw`, and `setManyRaw`. Namespace sanitization is applied at construction and when the `namespace` setter is used.

# Bun Support

We make a best effort to support [Bun](https://bun.sh/) as a runtime. Our default and primary target is Node.js, but we run tests against Bun to ensure compatibility. If you encounter any issues while using Keyv with Bun, please report them at our [GitHub issues](https://github.com/jaredwray/keyv/issues).

# How to Contribute

We welcome contributions to Keyv! 🎉 Here are some guides to get you started with contributing:

* [Contributing](https://github.com/jaredwray/keyv/blob/main/CONTRIBUTING.md) - Learn about how to contribute to Keyv
* [Code of Conduct](https://github.com/jaredwray/keyv/blob/main/CODE_OF_CONDUCT.md) - Learn about the Keyv Code of Conduct
* [How to Contribute](https://github.com/jaredwray/keyv/blob/main/README.md) - How do develop in the Keyv mono repo! 

# License

[MIT © Jared Wray](LICENSE)
