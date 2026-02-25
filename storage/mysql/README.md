# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)
[![npm](https://img.shields.io/npm/dm/@keyv/mysql)](https://npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Migrating to v6](#migrating-to-v6)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [uri](#uri)
  - [table](#table)
  - [keyLength](#keylength)
  - [namespaceLength](#namespacelength)
  - [iterationLimit](#iterationlimit)
  - [intervalExpiration](#intervalexpiration)
  - [namespace](#namespace-1)
- [Namespace Support](#namespace-support)
- [Methods](#methods)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value)](#setkey-value)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.clearExpired()](#clearexpired)
  - [.iterator(namespace)](#iteratornamespace)
  - [.disconnect()](#disconnect)
- [SSL](#ssl)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/mysql
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql('mysql://user:pass@localhost:3306/dbname'));
keyv.on('error', handleConnectionError);
```

You can also use the `createKeyv` helper function to create a `Keyv` instance with `KeyvMysql` as the store:

```js
import { createKeyv } from '@keyv/mysql';

const keyv = createKeyv('mysql://user:pass@localhost:3306/dbname');
```

Or with an options object:

```js
import { createKeyv } from '@keyv/mysql';

const keyv = createKeyv({ uri: 'mysql://user:pass@localhost:3306/dbname', table: 'cache', keyLength: 512 });
```

You can specify a custom table with the `table` option and the primary key length with `keyLength`.
If you want to use native MySQL scheduler to delete expired keys, you can specify `intervalExpiration` in seconds.

e.g:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keyLength: 255,
  intervalExpiration: 60
}));
```

## Migrating to v6

### Breaking changes

#### Native namespace support

In v5, namespaces were stored as key prefixes in the `id` column (e.g. `id="myns:mykey"` with `namespace=''`). In v6, the namespace is stored in a dedicated `namespace` column (e.g. `id="mykey"`, `namespace="myns"`). This enables more efficient queries and proper namespace isolation.

The adapter automatically adds the `namespace` column and creates the appropriate index when it connects, so no manual schema changes are needed for new installations.

#### `keySize` renamed to `keyLength`

The `keySize` option and property has been renamed to `keyLength` for consistency with the migration script and to better reflect that it controls VARCHAR column length.

```js
// v5
const store = new KeyvMysql({ uri, keySize: 512 });
store.keySize; // 512

// v6
const store = new KeyvMysql({ uri, keyLength: 512 });
store.keyLength; // 512
```

#### Properties instead of opts

In v5, configuration was accessed through the `opts` object:

```js
// v5
store.opts.table; // 'keyv'
store.opts.keySize; // 255
```

In v6, all configuration options are exposed as top-level properties with getters and setters:

```js
// v6
store.table; // 'keyv'
store.keyLength; // 255
store.table = 'cache';
```

The `opts` getter still exists for backward compatibility but should not be used for new code.

### New features

#### Native TTL support with `expires` column

v6 adds an `expires BIGINT` column to the table. When values are stored with a TTL via Keyv core, the adapter automatically extracts the `expires` timestamp from the serialized value and stores it in the column. The `intervalExpiration` event scheduler now queries this column directly instead of extracting from JSON, which is significantly more efficient.

The schema migration is automatic on connect — existing tables get the column and index added automatically.

#### `clearExpired()` method

A new utility method that deletes all rows where the `expires` column is set and the timestamp is in the past:

```js
await keyvMysql.clearExpired();
```

#### Bulk operations

v6 adds new methods for efficient multi-key operations:

- `.setMany(entries)` — bulk upsert using `ON DUPLICATE KEY UPDATE`
- `.hasMany(keys)` — bulk existence check

### Running the migration script

If you have existing data from v5, you need to run the migration script to move namespace prefixes from keys into the new `namespace` column. The script is located at `scripts/migrate-v6.ts` in the `@keyv/mysql` package.

Preview the changes first with `--dry-run`:

```shell
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --dry-run
```

Run the migration:

```shell
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname
```

You can also specify a custom table and column lengths:

```shell
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --table cache
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --keyLength 512 --namespaceLength 512
```

The migration runs inside a transaction and will roll back automatically if anything fails.

The migration script also populates the new `expires` column from existing JSON values in the `value` column.

**Important notes:**
- The script only migrates namespace rows where `namespace = ''` (the default). Rows that already have a namespace value (e.g. from a partial earlier migration) are skipped.
- Keys are split on the first colon — the part before becomes the namespace, the rest becomes the key. Namespaces containing colons are not supported.
- The `expires` column is populated by extracting `value->'$.expires'` from existing JSON values.

## Constructor Options

`KeyvMysql` accepts a connection URI string or an options object. The options object accepts the following properties along with any [`ConnectionOptions`](https://sidorares.github.io/node-mysql2/docs/documentation/connections) from the `mysql2` library (e.g. `host`, `port`, `user`, `password`, `database`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'mysql://localhost'` | MySQL connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keyLength` | `number` | `255` | Maximum key length (VARCHAR length) |
| `namespaceLength` | `number` | `255` | Maximum namespace column length (VARCHAR length) |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `intervalExpiration` | `number` | `undefined` | Interval in seconds for automatic expiration cleanup via MySQL event scheduler |

## Properties

All configuration options are exposed as properties with getters and setters on the `KeyvMysql` instance. You can read or update them after construction.

### uri

Get or set the MySQL connection URI.

- Type: `string`
- Default: `'mysql://localhost'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.uri); // 'mysql://user:pass@localhost:3306/dbname'
```

### table

Get or set the table name used for storage.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.table); // 'keyv'
store.table = 'cache';
```

### keyLength

Get or set the maximum key length (VARCHAR length) for the key column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', keyLength: 512 });
console.log(store.keyLength); // 512
```

### namespaceLength

Get or set the maximum namespace length (VARCHAR length) for the namespace column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', namespaceLength: 512 });
console.log(store.namespaceLength); // 512
```

### iterationLimit

Get or set the number of rows to fetch per iteration batch.

- Type: `number`
- Default: `10`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', iterationLimit: 50 });
console.log(store.iterationLimit); // 50
```

### intervalExpiration

Get or set the interval in seconds for automatic expiration cleanup via the MySQL event scheduler. When set to a value greater than 0, the adapter creates a MySQL scheduled event that periodically deletes expired entries.

- Type: `number | undefined`
- Default: `undefined` (disabled)

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', intervalExpiration: 60 });
console.log(store.intervalExpiration); // 60
```

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

## Namespace Support

The MySQL adapter supports native namespace scoping. When a namespace is set, keys are stored in a dedicated `namespace` column rather than being embedded in the key name. This provides efficient filtering and proper isolation between namespaces.

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyvA = new Keyv({ store: new KeyvMysql(uri), namespace: 'cache-a' });
const keyvB = new Keyv({ store: new KeyvMysql(uri), namespace: 'cache-b' });

// These don't conflict despite having the same key name
await keyvA.set('user:1', 'Alice');
await keyvB.set('user:1', 'Bob');

// clear() only affects the namespace it belongs to
await keyvA.clear(); // Only clears 'cache-a' entries
```

## Methods

### .get(key)

Returns the value for the given key. Returns `undefined` if the key does not exist.

```js
const value = await keyvMysql.get('foo');
```

### .getMany(keys)

Returns an array of values for the given keys. Returns `undefined` for any key that does not exist.

```js
const values = await keyvMysql.getMany(['foo', 'bar']);
```

### .set(key, value)

Sets a value for the given key. If the key already exists, it will be updated.

```js
await keyvMysql.set('foo', 'bar');
```

### .setMany(entries)

Set multiple key-value pairs at once. Each entry is an object with `key` and `value` properties.

```js
await keyvMysql.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux' },
]);
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await keyvMysql.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store. Returns `true` if at least one key was deleted, `false` otherwise.

```js
const deleted = await keyvMysql.deleteMany(['foo', 'bar']);
```

### .clear()

Clears all entries from the store. If a namespace is set, only entries within that namespace are cleared.

```js
await keyvMysql.clear();
```

### .has(key)

Returns `true` if the key exists in the store, `false` otherwise.

```js
const exists = await keyvMysql.has('foo');
```

### .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys.

```js
await keyvMysql.set('foo', 'bar');
await keyvMysql.set('baz', 'qux');

const results = await keyvMysql.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

### .clearExpired()

Deletes all entries where the `expires` column is set and the timestamp is in the past. Useful for periodic cleanup of expired entries.

```js
await keyvMysql.clearExpired();
```

### .iterator(namespace)

Returns an async iterator for iterating over all key-value pairs in the store. Uses keyset pagination to efficiently handle large datasets.

```js
for await (const [key, value] of keyvMysql.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Disconnects from the MySQL database and closes the connection pool.

```js
await keyvMysql.disconnect();
```

## SSL

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import fs from 'fs';

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
};

const keyvMysql = new KeyvMysql('mysql://user:pass@localhost:3306/dbname', options);
const keyv = new Keyv({ store: keyvMysql });
```

## License

[MIT © Jared Wray](LISCENCE)
