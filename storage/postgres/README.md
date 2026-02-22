# @keyv/postgres [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> PostgreSQL storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/postgres.svg)](https://www.npmjs.com/package/@keyv/postgres)
[![npm](https://img.shields.io/npm/dm/@keyv/postgres)](https://npmjs.com/package/@keyv/postgres)

PostgreSQL storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Requires Postgres 9.5 or newer for `ON CONFLICT` support to allow performant upserts. [Why?](https://stackoverflow.com/questions/17267417/how-to-upsert-merge-insert-on-duplicate-update-in-postgresql/17267423#17267423)

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
  - [schema](#schema)
  - [ssl](#ssl)
  - [iterationLimit](#iterationlimit)
  - [useUnloggedTable](#useunloggedtable)
  - [clearExpiredInterval](#clearexpiredinterval)
  - [namespace](#namespace)
- [Methods](#methods)
  - [.set(key, value)](#setkey-value)
  - [.setMany(entries)](#setmanyentries)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.clearExpired()](#clearexpired)
  - [.iterator(namespace?)](#iteratornamespace)
  - [.disconnect()](#disconnect)
- [Using an Unlogged Table for Performance](#using-an-unlogged-table-for-performance)
- [Connection Pooling](#connection-pooling)
- [SSL/TLS Connections](#ssltls-connections)
- [Testing](#testing)
- [License](#license)

# Install

```shell
npm install --save keyv @keyv/postgres
```

# Usage

```js
import Keyv from 'keyv';
import KeyvPostgres from '@keyv/postgres';

const keyv = new Keyv({ store: new KeyvPostgres('postgresql://user:pass@localhost:5432/dbname') });
keyv.on('error', handleConnectionError);
```

You can specify the `table` and `schema` options:

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', table: 'cache', schema: 'keyv' });
const keyv = new Keyv({ store: keyvPostgres });
```

You can also use the `createKeyv` helper function to create `Keyv` with `KeyvPostgres` store:

```js
import { createKeyv } from '@keyv/postgres';

const keyv = createKeyv({ uri: 'postgresql://user:pass@localhost:5432/dbname', table: 'cache', schema: 'keyv' });
```

# Migrating to v6

## Breaking changes

### Properties instead of opts

In v5, configuration was accessed through the `opts` object:

```js
// v5
store.opts.table; // 'keyv'
store.opts.schema; // 'public'
```

In v6, all configuration options are exposed as top-level properties with getters and setters:

```js
// v6
store.table; // 'keyv'
store.schema; // 'public'
store.table = 'cache';
```

The `opts` getter still exists for backward compatibility but should not be used for new code.

### Native namespace support

In v5, namespaces were stored as key prefixes in the `key` column (e.g. `key="myns:mykey"` with `namespace=NULL`). In v6, the namespace is stored in a dedicated `namespace` column (e.g. `key="mykey"`, `namespace="myns"`). This enables more efficient queries and proper namespace isolation.

The adapter automatically adds the `namespace` column and creates the appropriate index when it connects, so no manual schema changes are needed for new installations.

### Hookified integration

The adapter now extends [Hookified](https://hookified.org) instead of a custom EventEmitter. Events work the same (`on`, `emit`), but hooks are also available via the standard Hookified API.

## New features

### Native TTL support with `expires` column

v6 adds an `expires BIGINT` column to the table. When values are stored with a TTL via Keyv core, the adapter automatically extracts the `expires` timestamp from the serialized value and stores it in the column. A partial index is created on the `expires` column for efficient cleanup queries.

The schema migration is automatic on connect — existing tables get the column added via `ADD COLUMN IF NOT EXISTS`.

### `clearExpired()` method

A new utility method that deletes all rows where the `expires` column is set and the timestamp is in the past:

```js
await store.clearExpired();
```

### `clearExpiredInterval` option

Set an interval (in milliseconds) to automatically call `clearExpired()` on a schedule. Disabled by default (`0`). The timer uses `unref()` so it won't keep the Node.js process alive.

```js
const store = new KeyvPostgres({
  uri: 'postgresql://user:pass@localhost:5432/dbname',
  clearExpiredInterval: 60_000, // clean up every 60 seconds
});
```

### Bulk operations

New methods for efficient multi-key operations:

- `.setMany(entries)` — bulk upsert using PostgreSQL `UNNEST`
- `.getMany(keys)` — bulk retrieve using `ANY`
- `.deleteMany(keys)` — bulk delete using `ANY`
- `.hasMany(keys)` — bulk existence check

### `createKeyv()` helper

A convenience function to create a `Keyv` instance with `KeyvPostgres` as the store in one call:

```js
import { createKeyv } from '@keyv/postgres';

const keyv = createKeyv({ uri: 'postgresql://user:pass@localhost:5432/dbname' });
```

### Improved iterator

The iterator now uses cursor-based (keyset) pagination instead of `OFFSET`. This handles concurrent deletions during iteration without skipping entries and is more efficient for large datasets.

## Running the migration script

If you have existing data from v5, you need to run the migration script to move namespace prefixes from keys into the new `namespace` column. The script is located at `scripts/migrate-v6.ts` in the `@keyv/postgres` package.

Preview the changes first with `--dry-run`:

```shell
npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@localhost:5432/dbname --dry-run
```

Run the migration:

```shell
npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@localhost:5432/dbname
```

You can also specify a custom table, schema, and column lengths:

```shell
npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@localhost:5432/dbname --table cache --schema keyv
npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@localhost:5432/dbname --keyLength 512 --namespaceLength 512
```

The migration runs inside a transaction and will roll back automatically if anything fails.

**Important notes:**
- The script only migrates rows where `namespace IS NULL`. Rows that already have a namespace value (e.g. from a partial earlier migration) are skipped.
- Keys are split on the first colon — the part before becomes the namespace, the rest becomes the key. Namespaces containing colons are not supported.

# Constructor Options

`KeyvPostgres` accepts a connection URI string or an options object. The options object accepts the following properties along with any [`PoolConfig`](https://node-postgres.com/apis/pool) properties from the `pg` library (e.g. `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'postgresql://localhost:5432'` | PostgreSQL connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keyLength` | `number` | `255` | Maximum key column length (VARCHAR length) |
| `namespaceLength` | `number` | `255` | Maximum namespace column length (VARCHAR length) |
| `schema` | `string` | `'public'` | PostgreSQL schema name (created automatically if it doesn't exist) |
| `ssl` | `object` | `undefined` | SSL/TLS configuration passed to the `pg` driver |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `useUnloggedTable` | `boolean` | `false` | Use a PostgreSQL UNLOGGED table for better write performance |
| `clearExpiredInterval` | `number` | `0` | Interval in milliseconds to automatically clear expired entries (0 = disabled) |

# Properties

All configuration options are exposed as properties with getters and setters on the `KeyvPostgres` instance. You can read or update them after construction.

## uri

Get or set the PostgreSQL connection URI.

- Type: `string`
- Default: `'postgresql://localhost:5432'`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' });
console.log(store.uri); // 'postgresql://user:pass@localhost:5432/dbname'
```

## table

Get or set the table name used for storage.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' });
console.log(store.table); // 'keyv'
store.table = 'cache';
```

## keyLength

Get or set the maximum key length (VARCHAR length) for the key column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', keyLength: 512 });
console.log(store.keyLength); // 512
```

## namespaceLength

Get or set the maximum namespace length (VARCHAR length) for the namespace column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', namespaceLength: 512 });
console.log(store.namespaceLength); // 512
```

## schema

Get or set the PostgreSQL schema name. Non-public schemas are created automatically if they don't exist.

- Type: `string`
- Default: `'public'`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', schema: 'keyv' });
console.log(store.schema); // 'keyv'
```

## ssl

Get or set the SSL configuration for the PostgreSQL connection. Passed directly to the `pg` driver.

- Type: `object | undefined`
- Default: `undefined`

```js
const store = new KeyvPostgres({
  uri: 'postgresql://user:pass@localhost:5432/dbname',
  ssl: { rejectUnauthorized: false },
});
console.log(store.ssl); // { rejectUnauthorized: false }
```

## iterationLimit

Get or set the number of rows to fetch per iteration batch.

- Type: `number`
- Default: `10`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', iterationLimit: 50 });
console.log(store.iterationLimit); // 50
```

## useUnloggedTable

Get or set whether to use a PostgreSQL unlogged table for better write performance. Unlogged tables are faster but data is lost on crash.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', useUnloggedTable: true });
console.log(store.useUnloggedTable); // true
```

## clearExpiredInterval

Get or set the interval in milliseconds between automatic expired-entry cleanup runs. When set to a value greater than 0, the adapter will automatically call `clearExpired()` at the specified interval. The timer uses `unref()` so it won't keep the Node.js process alive. Setting to 0 disables the automatic cleanup.

- Type: `number`
- Default: `0` (disabled)

```js
// Clean up expired entries every 60 seconds
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', clearExpiredInterval: 60_000 });
console.log(store.clearExpiredInterval); // 60000

// Disable it later
store.clearExpiredInterval = 0;
```

## namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

# Methods

## .set(key, value)

Set a key-value pair.

```js
await keyv.set('foo', 'bar');
```

## .setMany(entries)

Set multiple key-value pairs at once using PostgreSQL `UNNEST` for efficient bulk operations.

```js
await keyv.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux' },
]);
```

## .get(key)

Get a value by key. Returns `undefined` if the key does not exist.

```js
const value = await keyv.get('foo'); // 'bar'
```

## .getMany(keys)

Get multiple values at once. Returns an array of values in the same order as the keys, with `undefined` for missing keys.

```js
const values = await keyv.getMany(['foo', 'baz']); // ['bar', 'qux']
```

## .has(key)

Check if a key exists. Returns a boolean.

```js
const exists = await keyv.has('foo'); // true
```

## .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys.

```js
await keyv.set('foo', 'bar');
await keyv.set('baz', 'qux');

const results = await keyv.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

## .delete(key)

Delete a key. Returns `true` if the key existed, `false` otherwise.

```js
const deleted = await keyv.delete('foo'); // true
```

## .deleteMany(keys)

Delete multiple keys at once. Returns `true` if any of the keys existed.

```js
const deleted = await keyv.deleteMany(['foo', 'baz']); // true
```

## .clear()

Clear all keys in the current namespace.

```js
await keyv.clear();
```

## .clearExpired()

Utility helper method to delete all expired entries from the store. This removes any rows where the `expires` column is set and the timestamp is in the past. This is useful for periodic cleanup of expired data.

```js
await keyv.clearExpired();
```

## .iterator(namespace?)

Iterate over all key-value pairs, optionally filtered by namespace. Uses cursor-based pagination controlled by the `iterationLimit` property.

```js
const iterator = keyv.iterator();
for await (const [key, value] of iterator) {
  console.log(key, value);
}
```

## .disconnect()

Disconnect from the PostgreSQL database and release the connection pool.

```js
await keyv.disconnect();
```

# Using an Unlogged Table for Performance

By default, the adapter creates a logged table. If you want to use an unlogged table for performance, you can pass the `useUnloggedTable` option to the constructor.

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', useUnloggedTable: true });
const keyv = new Keyv({ store: keyvPostgres });
```

From the [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-UNLOGGED):

If specified, the table is created as an unlogged table. Data written to unlogged tables is not written to the write-ahead log (see Chapter 28), which makes them considerably faster than ordinary tables. However, they are not crash-safe: an unlogged table is automatically truncated after a crash or unclean shutdown. The contents of an unlogged table are also not replicated to standby servers. Any indexes created on an unlogged table are automatically unlogged as well.

If this is specified, any sequences created together with the unlogged table (for identity or serial columns) are also created as unlogged.

# Connection Pooling

The adapter automatically uses the default settings on the `pg` package for connection pooling. You can override these settings by passing the options to the constructor such as setting the `max` pool size.

```js
const keyv = new Keyv({ store: new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', max: 20 }) });
```

# SSL/TLS Connections

You can configure SSL/TLS connections by passing the `ssl` option. This is passed directly to the underlying `pg` driver.

```js
const keyvPostgres = new KeyvPostgres({
  uri: 'postgresql://user:pass@localhost:5432/dbname',
  ssl: {
    rejectUnauthorized: false,
  },
});
const keyv = new Keyv({ store: keyvPostgres });
```

For more details on SSL configuration, see the [node-postgres SSL documentation](https://node-postgres.com/features/ssl).

# Testing

When testing you can use our `docker compose` postgresql instance by having docker installed and running. This will start a postgres server, run the tests, and stop the server:

At the root of the Keyv mono repo:
```shell
pnpm test:services:start
```

To just test the postgres adapter go to the postgres directory (storage/postgres) and run:
```shell
pnpm test
```

# License

[MIT © Jared Wray](LISCENCE)
