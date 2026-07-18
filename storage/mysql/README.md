# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

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
  - [.set(key, value, ttl?)](#setkey-value-ttl)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.clearExpired()](#clearexpired)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
- [Connection Pooling](#connection-pooling)
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
To delete expired keys periodically in the background, specify `intervalExpiration` in seconds.

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

The `keySize` option and property has been renamed to `keyLength` for consistency with the migration script and to better reflect that it controls key length.

```js
// v5
const store = new KeyvMysql({ uri, keySize: 512 });
store.keySize; // 512

// v6
const store = new KeyvMysql({ uri, keyLength: 512 });
store.keyLength; // 512
```

### New features

#### Native TTL support with `expires` column

v6 adds an `expires BIGINT` column to the table. When values are stored with a TTL via Keyv core, the adapter automatically extracts the `expires` timestamp from the serialized value and stores it in the column. The `intervalExpiration` application timer queries this column directly instead of extracting from JSON, which is significantly more efficient.

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

Dry-run mode only reads schema metadata and previews affected rows; it does not modify the schema or data.

Run the migration:

```shell
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname
```

You can also specify a custom table and column lengths:

```shell
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --table cache
npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --keyLength 512 --namespaceLength 256
```

The migration runs inside a transaction and will roll back automatically if anything fails.

The migration script also populates the new `expires` column from existing JSON values in the `value` column.

**Important notes:**
- The script only migrates namespace rows where `namespace = ''` (the default). Rows that already have a namespace value (e.g. from a partial earlier migration) are skipped.
- Keys are split on the first colon — the part before becomes the namespace, the rest becomes the key. Namespaces containing colons are not supported.
- The `expires` column is populated by extracting `value->'$.expires'` from existing JSON values.

## Constructor Options

`KeyvMysql` accepts a connection URI string or an options object. The options object accepts the following properties along with any [`PoolOptions`](https://sidorares.github.io/node-mysql2/docs) from the `mysql2` library (e.g. `host`, `port`, `user`, `password`, `database`, `connectionLimit`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'mysql://localhost'` | MySQL connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keyLength` | `number` | `255` | Maximum key length in Unicode code points |
| `namespaceLength` | `number` | `255` | Maximum namespace length in Unicode code points |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `intervalExpiration` | `number` | `undefined` | Interval in seconds for application-level expiration cleanup |

Because MySQL limits an InnoDB composite index to 3072 bytes and each Unicode code point may require four UTF-8 bytes, `keyLength + namespaceLength` must not exceed 768. The constructor, `resizeKeyColumns()`, and migration script reject larger combinations before changing the schema.

## Properties

Connection and schema configuration is exposed through getter-only properties. `uri`, `table`, `keyLength`, and `namespaceLength` cannot be assigned directly because changing them requires asynchronous connection or schema work. Use the awaited `reconnect()`, `useTable()`, and `resizeKeyColumns()` methods instead.

`iterationLimit`, `intervalExpiration`, and `namespace` remain mutable because their setters update live adapter behavior.

### uri

Get the active MySQL connection URI. This property is getter-only; use `reconnect()` to change it.

- Type: `string`
- Default: `'mysql://localhost'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.uri); // 'mysql://user:pass@localhost:3306/dbname'
```

### table

Get the active table name. This property is getter-only; use `useTable()` to change it.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.table); // 'keyv'
```

### keyLength

Get the active maximum key length in Unicode code points. This property is getter-only because it determines the initialized schema; use `resizeKeyColumns()` to change it.

- Type: `number`
- Default: `255`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', keyLength: 512 });
console.log(store.keyLength); // 512
```

### namespaceLength

Get the active maximum namespace length in Unicode code points. This property is getter-only because it determines the initialized schema; use `resizeKeyColumns()` to change it.

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

Get or set the interval in seconds for automatic expiration cleanup. When set to a value greater than 0, the adapter starts an unref'd application timer that periodically deletes expired entries. Changing the value restarts the timer, while `0` or `undefined` disables it. Cleanup runs never overlap, and changing the interval after `disconnect()` does not restart the timer. Values above `2147483.647` seconds are rejected because they exceed Node.js's maximum timer delay. The timer is stopped by `disconnect()` and does not require MySQL `EVENT` or global-variable privileges.

- Type: `number | undefined`
- Default: `undefined` (disabled)

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', intervalExpiration: 60 });
console.log(store.intervalExpiration); // 60
```

Earlier v6 prereleases created a schema event named `keyv_delete_expired_keys`. The adapter no longer creates, changes, or drops server events. If that legacy event exists, a database administrator can remove it once with `DROP EVENT IF EXISTS keyv_delete_expired_keys`.

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

Keys and namespaces are stored as exact UTF-8 bytes. Comparisons therefore preserve case, accents, Unicode normalization, and trailing spaces regardless of the database's default collation. For example, `AuditKey` and `auditkey`, composed and decomposed forms of `é`, and `key` and `key ` are all distinct. Existing text key columns are converted independently when the adapter initializes, preserving each column's existing character width.

The unique composite index is ordered as `(namespace, id)`, allowing MySQL to use the same index for exact key lookups, namespace clears, and namespace-scoped iteration. Existing `(id, namespace)` indexes created by earlier v6 prereleases are replaced atomically.

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

Runtime configuration methods are serialized with one another. Always await them before starting operations that must use the new configuration. `useTable()` and `resizeKeyColumns()` perform schema work and should be run while application writes are paused for a deterministic cutover.

### .reconnect(uri, mysqlOptions?)

Creates a replacement mysql2 pool, initializes the currently configured table on it, and switches the adapter only after preparation succeeds. The previous pool remains active during preparation and is closed after its already-started queries settle. If preparation fails, the adapter keeps using the previous connection.

Calling `reconnect()` after `disconnect()` reactivates the adapter and restarts automatic expiration cleanup when `intervalExpiration` is configured.

- `uri` *(string)* - MySQL connection URI for the replacement pool.
- `mysqlOptions` *(PoolOptions, optional)* - Replacement mysql2 pool options applied on top of the URI settings. When omitted, the replacement uses only the URI.
- Returns: `Promise<void>`

```js
await keyvMysql.reconnect('mysql://user:pass@replica.example.com:3306/cache', {
  connectionLimit: 20
});
console.log(keyvMysql.uri); // the replica URI
```

### .useTable(table)

Creates or migrates the target table using the same initialization performed by the constructor, then makes it active. The previous table remains active if initialization fails. This method does not copy, move, or delete data from the previous table.

- `table` *(string)* - Target table name. Database-qualified names such as `database.cache` are supported.
- Returns: `Promise<void>`

```js
await keyvMysql.useTable('sessions');
console.log(keyvMysql.table); // 'sessions'
```

### .resizeKeyColumns(options)

Changes the logical character limits and resizes both `VARBINARY` columns in one `ALTER TABLE` operation. Omitted values keep their current limits. Before changing the schema, the adapter validates MySQL's composite-index limit and scans existing UTF-8 keys and namespaces. A narrowing change is rejected if stored data exceeds the requested limit, leaving the schema and active limits unchanged.

- `options.keyLength` *(number, optional)* - New maximum key length in Unicode code points.
- `options.namespaceLength` *(number, optional)* - New maximum namespace length in Unicode code points.
- Returns: `Promise<void>`

```js
await keyvMysql.resizeKeyColumns({
  keyLength: 384,
  namespaceLength: 128
});
console.log(keyvMysql.keyLength); // 384
console.log(keyvMysql.namespaceLength); // 128
```

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

### .set(key, value, ttl?)

Sets a value for the given key. If the key already exists, it will be updated. Returns `true` on success, `false` on failure.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `ttl` *(number, optional)* - Time to live in milliseconds.
- Returns: `Promise<boolean>`

```js
await keyvMysql.set('foo', 'bar');
await keyvMysql.set('foo', 'bar', 5000); // expires in 5 seconds
```

### .setMany(entries)

Set multiple key-value pairs at once using a single atomic `INSERT ... ON DUPLICATE KEY UPDATE` statement. Each entry is a `KeyvEntry<Value>` object (`{ key: string, value: Value, ttl?: number }`), where `Value` is inferred from the entries provided. Returns a `boolean[]` indicating whether each entry was set successfully. Since the SQL statement is atomic, all entries either succeed (`true`) or all fail (`false`) together. On failure, an `error` event is emitted.

```js
const results = await keyvMysql.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux' },
]); // [true, true]
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await keyvMysql.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store. Returns a `boolean[]` indicating whether each key was deleted.

```js
const results = await keyvMysql.deleteMany(['foo', 'bar']); // [true, true]
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

### .iterator()

Returns an async iterator for iterating over all key-value pairs in the store. The iterator uses the namespace configured on the instance. Uses keyset pagination to efficiently handle large datasets.

```js
for await (const [key, value] of keyvMysql.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Stops the adapter from accepting new queries, waits for queries that have already started, and closes the adapter's connection pool. Repeated calls are safe and wait for the same shutdown.

```js
await keyvMysql.disconnect();
```

## Connection Pooling

Each `KeyvMysql` adapter creates and owns one `mysql2` connection pool. Pools are not shared implicitly between adapter instances, even when those adapters use the same URI and connection options. This keeps connection configuration and shutdown isolated: disconnecting one adapter does not affect another adapter.

Pool options such as `connectionLimit`, `maxIdle`, `idleTimeout`, and `queueLimit` are passed through to `mysql2` and apply separately to each adapter. If an application creates multiple adapters, account for the combined number of database connections.

Call `disconnect()` when an adapter is no longer needed, especially for short-lived instances:

```js
const store = new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  connectionLimit: 10,
});
const keyv = new Keyv({ store });

try {
  await keyv.set('foo', 'bar');
} finally {
  await keyv.disconnect();
}
```

## SSL

SSL options are passed through to `mysql2` as part of the options object. The constructor takes a single argument, so include the `uri` alongside the `ssl` configuration:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import fs from 'fs';
import path from 'path';

const keyvMysql = new KeyvMysql({
	uri: 'mysql://user:pass@localhost:3306/dbname',
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
});
const keyv = new Keyv({ store: keyvMysql });
```

## License

[MIT © Jared Wray](LISCENCE)
