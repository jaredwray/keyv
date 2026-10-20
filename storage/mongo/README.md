# @keyv/mongo [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

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
- [MongoDB Atlas](#mongodb-atlas)
  - [Connection string](#connection-string)
  - [Creating a database user](#creating-a-database-user)
  - [IP access list and private endpoints](#ip-access-list-and-private-endpoints)
  - [Choosing `db` and `collection`](#choosing-db-and-collection)
  - [TLS](#tls)
  - [Expired entries: TTL index and `clearExpired`](#expired-entries-ttl-index-and-clearexpired)
- [Migration from v3 to v6](#migration-from-v3-to-v6)
  - [Running the migration script](#running-the-migration-script)
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
const keyv = new Keyv(new KeyvMongo('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' }));
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
| `namespace` | `string \| undefined` | `undefined` | Namespace for keys, stored in each document's `namespace` field |
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

Get or set the namespace for the adapter. It is stored in each document's `namespace` field (or `metadata.namespace` with GridFS) and scopes operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

### useGridFS

Get whether GridFS is used for storing values. When enabled, values are stored using MongoDB's GridFS specification, which is useful for storing large files. This property is read-only and can only be set via the constructor, because the connection shape differs between GridFS and standard modes.

Each value is a GridFS file named after its key. `set` writes a new file and then deletes the key's older files, so a key keeps a single file. Reads always use the newest file for a key, and `delete` removes every file for it.

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

`set(key, value, expires?)` - Set a value in the store.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `expires` *(number, optional)* - Absolute expiry time as a Unix timestamp in milliseconds (`Date.now() + ttl`). If specified, the key expires at this time.
- Returns: `Promise<boolean>`

Through a `Keyv` instance, `keyv.set(key, value, ttl)` still takes a relative `ttl` in milliseconds. Keyv converts it to `expires` before it calls the adapter.

```js
const store = new KeyvMongo('mongodb://localhost:27017');
const keyv = new Keyv({ store });

await keyv.set('foo', 'bar');
await keyv.set('foo', 'bar', 5000); // Keyv takes a relative ttl: expires in 5 seconds

await store.set('foo', 'bar', Date.now() + 5000); // the adapter takes an absolute expires
```

### setMany

`setMany(entries)` - Set multiple values in the store at once.

- `entries` *(KeyvStorageEntry<Value>[])* - Array of entries to set. Each entry has a `key`, `value`, and optional `expires` (an absolute Unix timestamp in milliseconds). A `ttl` field is ignored. `Value` is inferred from the entries provided.
- Returns: `Promise<boolean[]>` - An array of booleans indicating whether each entry was set successfully.

Through a `Keyv` instance, `keyv.setMany()` takes entries with a relative `ttl` (`{ key, value, ttl? }`) and converts them before it calls the adapter.

In standard mode, uses a single unordered MongoDB `bulkWrite` operation for efficiency with per-entry error tracking — if individual writes fail, only those entries return `false`. In GridFS mode, each entry is set individually in parallel using `Promise.allSettled`, providing per-entry success tracking.

```js
const store = new KeyvMongo('mongodb://localhost:27017');

const results = await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', expires: Date.now() + 5000 },
]); // [true, true]
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

await store.set('key1', 'value1');
await store.set('key2', 'value2');

const values = await store.getMany(['key1', 'key2', 'key3']);
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

await store.set('key1', 'value1');
await store.set('key2', 'value2');

const results = await store.hasMany(['key1', 'key2', 'key3']);
console.log(results); // [true, true, false]
```

### delete

`delete(key)` - Delete a key from the store.

- `key` *(string)* - The key to delete.
- Returns: `Promise<boolean>` - `true` if the key was deleted, `false` if the key was not found or had expired. An expired entry is deleted too.

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
- Returns: `Promise<boolean[]>` - An array of booleans indicating whether each key was deleted. Expired entries are deleted too, but return `false`.

Each key is deleted individually in parallel so that per-key success/failure information is preserved in the returned array.

```js
const store = new KeyvMongo('mongodb://localhost:27017');

await store.set('key1', 'value1');
await store.set('key2', 'value2');

const results = await store.deleteMany(['key1', 'key2', 'key3']); // [true, true, false]
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

`iterator()` - Iterate over all key-value pairs in the store. The iterator uses the namespace configured on the instance.

- Returns: `AsyncGenerator<[string, any]>` - An async generator yielding `[key, value]` pairs.

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

await store.set('temp', 'data', Date.now() + 1000); // adapter takes an absolute expires (Unix ms); expires in ~1 second

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

## MongoDB Atlas

`@keyv/mongo` connects to MongoDB Atlas with the same `url` option it uses for any MongoDB deployment. The adapter calls `new MongoClient(url, options)` from the `mongodb` driver, where `options` is every option you pass that isn't a Keyv option (`url`, `uri`, `collection`, `namespace`, `useGridFS`, `db`, `readPreference`). So `auth`, `tls`, `serverSelectionTimeoutMS`, and the other settings below are standard [`MongoClientOptions`](https://mongodb.github.io/node-mongodb-native/7.0/interfaces/MongoClientOptions.html). `createKeyv` accepts the same options.

### Connection string

Click **Connect** on the cluster in the Atlas UI and choose **Drivers**. Atlas shows a connection string that starts with `mongodb+srv://`:

```
mongodb+srv://<db_username>:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

`cluster0.abcde.mongodb.net` is your cluster's hostname. With the `mongodb+srv` scheme, the driver looks up DNS records for that name when it connects: SRV records list the hosts, and a TXT record sets `authSource=admin` and, for a replica set, `replicaSet`. You don't add hosts, ports, or those options yourself.

Pass the database user's credentials with the `auth` option instead of in the URI, so they don't need any encoding:

```ts
import Keyv from 'keyv';
import KeyvMongo from '@keyv/mongo';

const store = new KeyvMongo({
  url: `mongodb+srv://${process.env.MONGODB_HOST}/?retryWrites=true&w=majority&appName=keyv`,
  auth: {
    username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD,
  },
  db: 'keyv',
  collection: 'cache',
});

const keyv = new Keyv({ store });
keyv.on('error', (error) => console.error('MongoDB error', error));

await keyv.set('greeting', 'hello', 60_000);
console.log(await keyv.get('greeting')); // 'hello'
await keyv.disconnect();
```

Set `MONGODB_HOST` to the cluster hostname (`cluster0.abcde.mongodb.net`), and `MONGODB_USERNAME` and `MONGODB_PASSWORD` to the database user from [Creating a database user](#creating-a-database-user).

If you'd rather keep the credentials in the URI, encode them with `encodeURIComponent`. The driver rejects a user name or password that contains an unencoded `:`, `/`, `?`, `#`, `[`, `]`, or `@`, and it percent-decodes both, so a literal `%` must be encoded too:

```ts
const username = encodeURIComponent(process.env.MONGODB_USERNAME ?? '');
const password = encodeURIComponent(process.env.MONGODB_PASSWORD ?? '');
const store = new KeyvMongo(
  `mongodb+srv://${username}:${password}@${process.env.MONGODB_HOST}/?retryWrites=true&w=majority`,
  { db: 'keyv', collection: 'cache' },
);
```

### Creating a database user

Atlas database users are separate from the accounts you sign in to Atlas with. To create one, go to **Database & Network Access** under **Security**, open **Database Users**, and click **Add New Database User**:

1. Choose **Password** as the authentication method and set a user name and password. Atlas stores password (SCRAM) users in the `admin` database, which is the `authSource` the cluster's TXT record sets.
2. Under **Specific Privileges**, grant `readWrite` on the database you pass as `db`. The **Read and write to any database** built-in role also works, but it gives access to every database in the project.
3. Click **Add User**.

The user needs write access to create indexes, not just to store values. In standard mode the adapter creates a unique index on `{ key, namespace }` and a TTL index on `expiresAt` when it connects. In GridFS mode it creates indexes on the bucket's `.files` collection instead, and none of them is a TTL index. A user with only `read` fails on the first `createIndexes` command. The adapter emits `error`, and a Keyv instance with an `error` listener returns its fallback value.

### IP access list and private endpoints

Atlas only accepts connections from addresses on the project's IP access list. Add yours from **Database & Network Access** > **IP Access List** > **Add IP Address**, using the public IP address or CIDR range your application connects from. For an application in a private subnet that's usually the public IP of its NAT gateway. **Allow access from anywhere** adds `0.0.0.0/0`, which exposes the cluster to the whole internet, so avoid it outside quick tests.

An address that isn't on the list can't reach the cluster. The driver keeps retrying until `serverSelectionTimeoutMS` (30 seconds by default) runs out, then fails with `MongoServerSelectionError`. The adapter emits that as `error`, and a Keyv instance with an `error` listener returns its fallback value, such as `undefined` from `get`. Lower the timeout to find out sooner:

```ts
const store = new KeyvMongo({
  url: `mongodb+srv://${process.env.MONGODB_HOST}/`,
  auth: { username: process.env.MONGODB_USERNAME, password: process.env.MONGODB_PASSWORD },
  db: 'keyv',
  serverSelectionTimeoutMS: 5000,
});
```

On dedicated clusters (`M10` and up), you can connect through a private endpoint instead, so traffic stays on the cloud provider's network: AWS PrivateLink, Azure Private Link, or Google Cloud Private Service Connect. Set it up under **Database & Network Access** > **Private Endpoint**. Once it's available, the **Connect** dialog offers a **Private Endpoint** connection type with its own hostname, such as `cluster0-pl-0.abcde.mongodb.net` (`-psc-` instead of `-pl-` for Private Service Connect with port mapping). Use that hostname in `url`. Nothing else in the adapter configuration changes, but only clients in a network connected to the endpoint can resolve and reach it. MongoDB recommends the `mongodb+srv` form of the private endpoint string, because the ports behind the endpoint can change and the SRV records follow them. The IP access list still applies to clients that connect over the public internet or through network peering with the standard hostname.

### Choosing `db` and `collection`

- `db` is the database the adapter stores data in. It is passed to `MongoClient.db()`. When you leave it out, the driver uses the database named in the URI path, and `test` when the path is empty, as it is in the strings Atlas generates. Set `db` explicitly. Putting the database in the path (`mongodb+srv://cluster0.abcde.mongodb.net/keyv`) works as well: with `mongodb+srv`, the TXT record's `authSource=admin` still takes precedence over the path.
- `collection` defaults to `keyv`. MongoDB creates the collection and the adapter's indexes the first time you connect. With `useGridFS: true` it is the bucket name, and data goes to `<collection>.files` and `<collection>.chunks`.
- Several Keyv instances can share a collection. Give each its own `namespace`, which the adapter stores in a separate field and uses to scope `get`, `clear()`, and `iterator()`. Use separate collections when you want to drop or size one cache without touching the others.

### TLS

Atlas requires TLS on every connection, and a `mongodb+srv` URI turns it on: the driver sets `tls: true` for SRV URIs unless you set `tls` or `ssl` yourself. A standard `mongodb://` Atlas string has `ssl=true` in its query string instead. Atlas certificates are signed by a public certificate authority that Node.js trusts by default, so you don't need a CA file.

Don't set `tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames`, or `tlsInsecure` for Atlas. They connect, but skip the certificate checks that protect against an attacker in the middle. For X.509 authentication instead of a password, pass the client certificate with `tlsCertificateKeyFile`, set `authMechanism: 'MONGODB-X509'`, and set `authSource: '$external'`. The TXT record's `authSource=admin` would otherwise look for that user in `admin`.

### Expired entries: TTL index and `clearExpired`

In standard mode you don't need to schedule anything. When it connects, the adapter creates a [TTL index](https://www.mongodb.com/docs/manual/core/index-ttl/) on `expiresAt` with `expireAfterSeconds: 0`, and MongoDB's background TTL monitor deletes each document after its `expiresAt` passes. The monitor runs about once a minute, so expired documents can linger for a while, but `get`, `getMany`, `has`, and `iterator()` check `expiresAt` themselves and never return an expired value. `clearExpired()` does nothing in standard mode and returns `false`.

Don't create your own TTL index on `expiresAt` in the adapter's collection. MongoDB names it `expiresAt_1` like the adapter's index, and if its options differ, connecting fails with `An equivalent index already exists with the same name but different options`.

GridFS mode has no TTL index. A TTL index deletes documents only from the collection it is on, so it would remove a file's `.files` document but leave its data in `.chunks`. Expired files stay until a read finds them or you call `clearExpired()`, which deletes expired files and their chunks in the adapter's current namespace. Call it on a schedule:

```ts
const store = new KeyvMongo({
  url: `mongodb+srv://${process.env.MONGODB_HOST}/`,
  auth: { username: process.env.MONGODB_USERNAME, password: process.env.MONGODB_PASSWORD },
  db: 'keyv',
  collection: 'files',
  useGridFS: true,
});

const timer = setInterval(() => {
  store.clearExpired().catch((error) => console.error('clearExpired failed', error));
}, 60 * 60 * 1000);
timer.unref();
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

#### `ttlSupport` Property Removed

The `ttlSupport` property has been removed. If your code checks for TTL support on the adapter, remove those checks.

#### `set` Takes an Absolute `expires`

The third argument of the adapter's `set` is now an absolute Unix timestamp in milliseconds, not a relative `ttl`. This only affects code that calls the adapter directly. `keyv.set(key, value, ttl)` still takes a relative `ttl`.

```js
// v3 - relative ttl
await store.set('foo', 'bar', 5000);

// v6 - absolute expires
await store.set('foo', 'bar', Date.now() + 5000);
```

#### Namespaces Are Stored in Their Own Field

v3 stored the namespace as a prefix of each key (`key: "keyv:foo"`) and wrote no namespace field. v6 stores it separately (`key: "foo"`, `namespace: "keyv"`) and only reads documents that have a `namespace` field, so documents written by v3 stay invisible to v6 until you [run the migration script](#running-the-migration-script).

The unique index on the underlying MongoDB collection has also changed from `{ key: 1 }` to `{ key: 1, namespace: 1 }`, so the same key can exist in different namespaces. The adapter drops the old index and creates the new one when it connects.

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

Batch set multiple key-value pairs in a single operation using MongoDB `bulkWrite`. Each entry takes an optional absolute `expires` timestamp (Unix ms).

```js
await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', expires: Date.now() + 5000 },
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

### Running the migration script

If you have documents written by `@keyv/mongo` v3, run the migration script so v6 can read them. The script ships in the npm package at `scripts/migrate-v6.ts`. Run it from your project root with `tsx`. Node.js refuses to strip TypeScript types from files under `node_modules`, so running the script with plain `node` from there fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

Preview the changes first with `--dry-run`. Dry-run mode only counts and previews the documents that would change:

```shell
npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@localhost:27017/dbname --dry-run
```

Run the migration:

```shell
npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@localhost:27017/dbname
```

Pass `--collection` if you set a custom collection, `--db` if the database is not in the URI, and `--gridfs` for a store created with `useGridFS: true`:

```shell
npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@localhost:27017 --db cache --collection sessions
npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@localhost:27017/dbname --gridfs
```

From a clone of this repo you can run `node scripts/migrate-v6.ts` in `storage/mongo` with the same flags.

**Important notes:**
- The script only changes documents that have no `namespace` field, so it is safe to run again. Documents already in the v6 layout are never touched.
- Keys are split on the first colon: the part before becomes the namespace, the rest becomes the key. A key without a colon gets the empty namespace v6 uses when none is set. Namespaces containing colons are not supported. The split is also wrong for colon-containing keys that Keyv v5 stored without a prefix, which happens only when it ran with `useKeyPrefix: false` or an empty namespace.
- Keyv v5 used `keyv` as the namespace when none was set, so those documents migrate into namespace `keyv`. Pass `namespace: 'keyv'` to Keyv afterwards to keep reading them. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#the-default-keyv-namespace-was-removed).
- In standard mode the script first replaces the unique index on `key` with the unique index on `{ key, namespace }`, the same change the adapter makes when it connects.
- If v6 already stores a value under the same key and namespace, that value was written after the upgrade and is kept. The v3 document is left unchanged and listed in the output.
- In GridFS mode, v3 kept every revision of a file and read the newest. The script migrates only the newest revision of each key and lists the older ones, which v6 cannot read.
- The rewrite is not transactional. If it stops part way, documents already migrated keep their new layout, so run the script again to finish.

## License

[MIT © Jared Wray](LICENSE)
