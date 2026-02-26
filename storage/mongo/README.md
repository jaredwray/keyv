# @keyv/mongo [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MongoDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mongo.svg)](https://www.npmjs.com/package/@keyv/mongo)
[![npm](https://img.shields.io/npm/dm/@keyv/mongo)](https://npmjs.com/package/@keyv/mongo)

MongoDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Uses TTL indexes to automatically remove expired documents. However [MongoDB doesn't guarantee data will be deleted immediately upon expiration](https://docs.mongodb.com/manual/core/index-ttl/#timing-of-the-delete-operation), so expiry dates are revalidated in Keyv.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [url](#url)
  - [collection](#collection)
  - [namespace](#namespace)
  - [useGridFS](#usegridfs)
  - [db](#db)
  - [readPreference](#readpreference)
- [Methods](#methods)
  - [set](#set)
  - [setMany](#setmany)
  - [get](#get)
  - [getMany](#getmany)
  - [has](#has)
  - [hasMany](#hasmany)
  - [delete](#delete)
  - [deleteMany](#deletemany)
  - [clear](#clear)
  - [iterator](#iterator)
  - [disconnect](#disconnect)
  - [clearExpired](#clearexpired)
  - [clearUnusedFor](#clearunusedfor)
- [Migration from v3 to v6](#migration-from-v3-to-v6)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/mongo
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMongo from '@keyv/mongo';

const keyv = new Keyv(new KeyvMongo('mongodb://user:pass@localhost:27017/dbname'));
keyv.on('error', handleConnectionError);
```

You can specify the collection name, by default `'keyv'` is used.

e.g:

```js
const keyv = new Keyv('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' });
```

You can also use the `createKeyv` helper function to create a `Keyv` instance with `KeyvMongo` as the store:

```js
import { createKeyv } from '@keyv/mongo';

const keyv = createKeyv('mongodb://user:pass@localhost:27017/dbname');
```

## Constructor Options

The `KeyvMongo` constructor accepts a connection URI string or an options object:

```js
// With URI string
const store = new KeyvMongo('mongodb://user:pass@localhost:27017/dbname');

// With options object
const store = new KeyvMongo({
  url: 'mongodb://user:pass@localhost:27017/dbname',
  collection: 'cache',
  db: 'mydb',
  useGridFS: false,
});

// With URI string and additional options
const store = new KeyvMongo('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'mongodb://127.0.0.1:27017'` | MongoDB connection URI |
| `collection` | `string` | `'keyv'` | Collection name for storage |
| `namespace` | `string \| undefined` | `undefined` | Namespace prefix for keys |
| `useGridFS` | `boolean` | `false` | Whether to use GridFS for storing values |
| `db` | `string \| undefined` | `undefined` | Database name |
| `readPreference` | `ReadPreference \| undefined` | `undefined` | MongoDB read preference for GridFS operations |

Any additional options are passed through to the MongoDB driver as `MongoClientOptions`.

## Properties

Most configuration options are exposed as properties with getters and setters on the `KeyvMongo` instance. You can read or update them after construction. Some properties like `useGridFS` are read-only and can only be set via the constructor.

### url

Get or set the MongoDB connection URI.

- Type: `string`
- Default: `'mongodb://127.0.0.1:27017'`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
console.log(store.url); // 'mongodb://user:pass@localhost:27017/dbname'
```

### collection

Get or set the collection name used for storage.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
console.log(store.collection); // 'keyv'
store.collection = 'cache';
```

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

### useGridFS

Get whether GridFS is used for storing values. When enabled, values are stored using MongoDB's GridFS specification, which is useful for storing large files. This property is read-only and can only be set via the constructor, because the connection shape differs between GridFS and standard modes.

- Type: `boolean`
- Default: `false`
- Read-only (set via constructor only)

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname', useGridFS: true });
console.log(store.useGridFS); // true
```

### db

Get or set the database name for the MongoDB connection.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017', db: 'mydb' });
console.log(store.db); // 'mydb'
```

### readPreference

Get or set the MongoDB read preference for GridFS operations.

- Type: `ReadPreference | undefined`
- Default: `undefined`

```js
import { ReadPreference } from 'mongodb';

const store = new KeyvMongo({
  url: 'mongodb://user:pass@localhost:27017/dbname',
  useGridFS: true,
  readPreference: ReadPreference.SECONDARY,
});
console.log(store.readPreference); // ReadPreference.SECONDARY
```

## Methods

### set

`set(key, value, ttl?)` - Set a value in the store.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `ttl` *(number, optional)* - Time to live in milliseconds. If specified, the key will expire after this duration.
- Returns: `Promise<void>`

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('foo', 'bar');
await keyv.set('foo', 'bar', 5000); // expires in 5 seconds
```

### setMany

`setMany(entries)` - Set multiple values in the store at once.

- `entries` *(Array<{ key: string, value: any, ttl?: number }>)* - Array of entries to set. Each entry has a `key`, `value`, and optional `ttl` in milliseconds.
- Returns: `Promise<void>`

In standard mode, uses a single MongoDB `bulkWrite` operation for efficiency. In GridFS mode, each entry is set individually in parallel.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 5000 },
]);
```

### get

`get(key)` - Get a value from the store.

- `key` *(string)* - The key to retrieve.
- Returns: `Promise<any>` - The stored value, or `undefined` if the key does not exist.

In GridFS mode, `get` also updates the `lastAccessed` timestamp on the file, which is used by `clearUnusedFor`.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo');
console.log(value); // 'bar'

const missing = await keyv.get('nonexistent');
console.log(missing); // undefined
```

### getMany

`getMany(keys)` - Get multiple values from the store at once.

- `keys` *(string[])* - Array of keys to retrieve.
- Returns: `Promise<Array<any>>` - Array of values in the same order as the input keys. Missing keys return `undefined` at their position.

In standard mode, uses a single MongoDB query with the `$in` operator for efficiency. In GridFS mode, each key is fetched individually.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

const values = await keyv.get(['key1', 'key2', 'key3']);
console.log(values); // ['value1', 'value2', undefined]
```

### has

`has(key)` - Check if a key exists in the store.

- `key` *(string)* - The key to check.
- Returns: `Promise<boolean>` - `true` if the key exists, `false` otherwise.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('foo', 'bar');
console.log(await keyv.has('foo')); // true
console.log(await keyv.has('nonexistent')); // false
```

### hasMany

`hasMany(keys)` - Check if multiple keys exist in the store at once.

- `keys` *(string[])* - Array of keys to check.
- Returns: `Promise<boolean[]>` - Array of booleans in the same order as the input keys.

Uses a single MongoDB query with the `$in` operator for efficiency in both standard and GridFS modes.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

const results = await keyv.has(['key1', 'key2', 'key3']);
console.log(results); // [true, true, false]
```

### delete

`delete(key)` - Delete a key from the store.

- `key` *(string)* - The key to delete.
- Returns: `Promise<boolean>` - `true` if the key was deleted, `false` if the key was not found.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('foo', 'bar');
console.log(await keyv.delete('foo')); // true
console.log(await keyv.delete('nonexistent')); // false
```

### deleteMany

`deleteMany(keys)` - Delete multiple keys from the store at once.

- `keys` *(string[])* - Array of keys to delete.
- Returns: `Promise<boolean>` - `true` if any keys were deleted, `false` if none were found.

In standard mode, uses a single MongoDB query with the `$in` operator. In GridFS mode, all matching files are found and deleted in parallel.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

console.log(await keyv.delete(['key1', 'key2', 'key3'])); // true
```

### clear

`clear()` - Delete all keys in the current namespace.

- Returns: `Promise<void>`

Only keys matching the current namespace are removed. If no namespace is set, all keys with an empty namespace are cleared.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store, namespace: 'my-namespace' });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

await keyv.clear(); // removes all keys in 'my-namespace'
```

### iterator

`iterator(namespace?)` - Iterate over all key-value pairs in the store.

- `namespace` *(string, optional)* - The namespace to iterate over. When used through Keyv, the namespace is passed automatically from the Keyv instance.
- Returns: `AsyncGenerator<[string, any]>` - An async generator yielding `[key, value]` pairs.

When used through Keyv, the namespace prefix is stripped from keys automatically.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store, namespace: 'ns' });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

for await (const [key, value] of keyv.iterator()) {
  console.log(key, value); // 'key1' 'value1', 'key2' 'value2'
}
```

### disconnect

`disconnect()` - Close the MongoDB connection.

- Returns: `Promise<void>`

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

// ... use the store ...

await keyv.disconnect();
```

### clearExpired

`clearExpired()` - Remove all expired files from GridFS. This method only works in GridFS mode and is a no-op that returns `false` in standard mode.

- Returns: `Promise<boolean>` - `true` if running in GridFS mode, `false` otherwise.

This is useful for manual cleanup of expired GridFS files, since GridFS does not support MongoDB TTL indexes.

```js
const store = new KeyvMongo({ url: 'mongodb://localhost:27017', useGridFS: true });

await store.set('temp', 'data', 1000); // expires in 1 second

// After expiration...
await store.clearExpired(); // removes expired GridFS files
```

### clearUnusedFor

`clearUnusedFor(seconds)` - Remove all GridFS files that have not been accessed for the specified duration. This method only works in GridFS mode and is a no-op that returns `false` in standard mode.

- `seconds` *(number)* - The number of seconds of inactivity after which files should be removed.
- Returns: `Promise<boolean>` - `true` if running in GridFS mode, `false` otherwise.

The `lastAccessed` timestamp is updated each time a file is read via `get`.

```js
const store = new KeyvMongo({ url: 'mongodb://localhost:27017', useGridFS: true });

await store.set('foo', 'bar');

// Remove files not accessed in the last hour
await store.clearUnusedFor(3600);
```

## Migration from v3 to v6

`@keyv/mongo` is jumping from v3 to v6 because the entire Keyv monorepo is now unified under a single version number. This approach, similar to what other popular open source projects do, keeps all `@keyv/*` packages in sync and makes it easier to reason about compatibility across the ecosystem.

### Breaking Changes

#### MongoDB Driver Upgraded to v7

The `mongodb` dependency has been upgraded from `^6.x` to `^7.0.0`. Review the [MongoDB Node.js Driver v7 release notes](https://github.com/mongodb/node-mongodb-native/releases/tag/v7.0.0) for any breaking changes that may affect your application.

#### Event Handling: EventEmitter Replaced with Hookified

`KeyvMongo` no longer extends Node.js `EventEmitter`. It now extends `Hookified`, which provides hook-based event management.

```js
// v3 - EventEmitter
const store = new KeyvMongo('mongodb://localhost:27017');
store.on('error', err => console.error(err));

// v6 - Hookified (same usage for basic events)
const store = new KeyvMongo('mongodb://localhost:27017');
store.on('error', err => console.error(err));
```

For most use cases the `.on()` API is the same, but if you relied on EventEmitter-specific methods like `.listenerCount()`, `.rawListeners()`, or `.prependListener()`, check the [Hookified documentation](https://github.com/jaredwray/hookified) for equivalents.

#### `useGridFS` is Now Read-Only

The `useGridFS` property can no longer be changed after construction. The connection shape differs between GridFS and standard modes, so this must be set at construction time.

```js
// v3 - Could change after instantiation
const store = new KeyvMongo('mongodb://localhost:27017');
store.useGridFS = true; // worked in v3

// v6 - Must set at construction
const store = new KeyvMongo({ url: 'mongodb://localhost:27017', useGridFS: true });
console.log(store.useGridFS); // true (read-only)
```

#### Property Access Changed from `opts` to Direct Getters/Setters

Properties are no longer accessed through an `opts` object. Use the direct getters and setters on the instance instead.

```js
// v3
store.opts.url;
store.opts.collection = 'cache';

// v6
store.url;
store.collection = 'cache';
```

#### `ttlSupport` Property Removed

The `ttlSupport` property has been removed. If your code checks for TTL support on the adapter, remove those checks.

#### Namespace Index Change

The unique index on the underlying MongoDB collection has changed from `{ key: 1 }` to `{ key: 1, namespace: 1 }`. This allows the same key name to exist in different namespaces without conflicts. The old index is automatically dropped and replaced on first connection, so no manual migration is needed.

#### Options Type is Now Strongly Typed

The constructor options no longer accept arbitrary keys via `[key: string]: unknown`. Options are now strictly typed with explicit properties. Any additional MongoDB driver options should be valid `MongoClientOptions` properties.

```js
// v3 - Accepted any properties
const store = new KeyvMongo({ url: 'mongodb://...', customProp: true }); // no type error

// v6 - Strictly typed
const store = new KeyvMongo({ url: 'mongodb://...', collection: 'cache' }); // only known props + MongoClientOptions
```

### New Features

#### `createKeyv` Helper Function

A new `createKeyv` helper simplifies creating a Keyv instance with the MongoDB adapter.

```js
import { createKeyv } from '@keyv/mongo';

// Before
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store, namespace: 'my-ns' });

// After
const keyv = createKeyv({ url: 'mongodb://localhost:27017', namespace: 'my-ns' });
```

#### `setMany` Method

Batch set multiple key-value pairs in a single operation using MongoDB `bulkWrite`.

```js
await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 5000 },
]);
```

#### `hasMany` Method

Check if multiple keys exist in a single query using the `$in` operator.

```js
const results = await store.hasMany(['key1', 'key2', 'key3']);
// [true, true, false]
```

#### `clearExpired` Method

Manually remove expired files from GridFS storage.

```js
const store = new KeyvMongo({ url: 'mongodb://localhost:27017', useGridFS: true });
await store.clearExpired();
```

#### `clearUnusedFor` Method

Remove GridFS files that have not been accessed for a specified duration.

```js
const store = new KeyvMongo({ url: 'mongodb://localhost:27017', useGridFS: true });
await store.clearUnusedFor(3600); // remove files unused for 1 hour
```

## License

[MIT © Jared Wray](LISCENCE)
