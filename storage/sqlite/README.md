# @keyv/sqlite [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> SQLite storage adapter for Keyv with multi-driver support for `nodejs`, `bun`, and custom drivers.

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/sqlite.svg)](https://www.npmjs.com/package/@keyv/sqlite)
[![npm](https://img.shields.io/npm/dm/@keyv/sqlite)](https://npmjs.com/package/@keyv/sqlite)

SQLite storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Using createKeyv](#using-createkeyv)
- [Multi-Driver Support](#multi-driver-support)
- [Creating a Custom Driver](#creating-a-custom-driver)
- [Using sqlite3](#using-sqlite3)
- [Migrating to v6](#migrating-to-v6)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [capabilities](#capabilities)
  - [namespace](#namespace)
  - [uri](#uri)
  - [table](#table)
  - [keySize](#keysize)
  - [keyLength](#keylength)
  - [namespaceLength](#namespacelength)
  - [db](#db)
  - [iterationLimit](#iterationlimit)
  - [wal](#wal)
  - [busyTimeout](#busytimeout)
  - [driver](#driver)
  - [driverName](#drivername)
  - [clearExpiredInterval](#clearexpiredinterval)
  - [ready](#ready)
  - [opts](#opts)
- [Methods](#methods)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.clearExpired()](#clearexpired)
  - [.iterator()](#iterator)
  - [.query(sql, ...params)](#querysql-params)
  - [.close()](#close)
  - [.disconnect()](#disconnect)
- [Events](#events)
- [Clearing Expired Keys](#clearing-expired-keys)
- [WAL Mode](#wal-mode)
- [Benchmarks](#benchmarks)
- [License](#license)

# Install

```shell
npm install --save keyv @keyv/sqlite
```

# Usage

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const keyv = new Keyv({ store: new KeyvSqlite('sqlite://path/to/database.sqlite') });
keyv.on('error', err => console.error(err));
```

You can specify the `table`, `busyTimeout`, and `wal` options:

```js
const keyvSqlite = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  table: 'cache',
  busyTimeout: 10000,
  wal: true,
});
const keyv = new Keyv({ store: keyvSqlite });
```

# Using createKeyv

The `createKeyv` helper creates a `Keyv` instance with `KeyvSqlite` as the store in one call:

```js
import { createKeyv } from '@keyv/sqlite';

// With a URI string
const keyv = createKeyv('sqlite://path/to/database.sqlite');

// With an options object
const keyv = createKeyv({
  uri: 'sqlite://path/to/database.sqlite',
  table: 'cache',
  wal: true,
});
```

# Multi-Driver Support

`@keyv/sqlite` supports multiple SQLite drivers and automatically selects the best one available for your runtime:

| Driver | Package | Runtime | Type |
| --- | --- | --- | --- |
| `better-sqlite3` | `better-sqlite3` | Node.js | Synchronous (bundled fallback) |
| `node:sqlite` | Built-in | Node.js 22.13+ | Synchronous (auto-detected default; still experimental) |
| `bun:sqlite` | Built-in | Bun | Synchronous |

The built-in runtime drivers are preferred: on Node.js 22.13+ the built-in `node:sqlite` driver is used (unflagged since 22.13, still experimental — [Stability 1.1](https://nodejs.org/api/sqlite.html)), and on Bun the native `bun:sqlite` driver is used. `better-sqlite3` is included as a direct dependency and used as a fallback when a built-in driver is unavailable, or explicitly via `driver: 'better-sqlite3'`. If you still need to use `sqlite3` then go to the [using sqlite3](#using-sqlite3).

## Selecting a specific driver

You can explicitly choose a driver via the `driver` option:

```js
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  driver: 'better-sqlite3', // or 'node:sqlite' or 'bun:sqlite'
});
```

## Auto-detection order

When no `driver` is specified, the adapter tries drivers in this order:

- **Bun**: `bun:sqlite` then `better-sqlite3`
- **Node.js**: `node:sqlite` then `better-sqlite3`

# Creating a Custom Driver

You can pass a custom driver object that implements the `SqliteDriver` interface. A custom driver must provide a `name` and a `connect()` method that returns `{ query, close }`:

```ts
import KeyvSqlite from '@keyv/sqlite';
import type { SqliteDriver } from '@keyv/sqlite';

const customDriver: SqliteDriver = {
  name: 'custom',
  async connect(options) {
    // options: { filename: string, busyTimeout?: number, wal?: boolean }
    return {
      async query(sql, ...params) {
        // Execute SQL and return rows for SELECT/PRAGMA, empty array for mutations
      },
      async close() {
        // Close the database connection
      },
    };
  },
};

const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  driver: customDriver,
});
```

The `query` function must return an array of row objects for `SELECT` and `PRAGMA` statements, and an empty array for all other statements (`INSERT`, `UPDATE`, `DELETE`, etc.).

## Type exports

The following types are available for building custom drivers:

```ts
import type {
  SqliteDriver,        // Driver interface: { name, connect() }
  SqliteDriverName,    // 'better-sqlite3' | 'node:sqlite' | 'bun:sqlite' | 'custom'
  KeyvSqliteOptions,   // Constructor options
  Sqlite3ModuleLike,   // Structural type for the sqlite3 module
  Sqlite3DatabaseLike, // Structural type for a sqlite3.Database instance
} from '@keyv/sqlite';
```

The `createSqlite3Driver` export is a real-world example of a custom driver — see [Using sqlite3](#using-sqlite3).

# Using sqlite3

The callback-based [`sqlite3`](https://www.npmjs.com/package/sqlite3) package is not auto-detected or bundled with `@keyv/sqlite`. If you need to use it, install it in your project and pass it via the `createSqlite3Driver` helper. Note that `sqlite3` ships no prebuilt binaries for newer Node.js versions (it fails to compile on Node 26+), so prefer the default `better-sqlite3` or `node:sqlite` drivers unless you have an existing dependency on it:

```bash
npm install sqlite3
```

```ts
import KeyvSqlite, { createSqlite3Driver } from '@keyv/sqlite';
import sqlite3 from 'sqlite3';

const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  driver: createSqlite3Driver(sqlite3),
});
```

`sqlite3.verbose()` also works:

```ts
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  driver: createSqlite3Driver(sqlite3.verbose()),
});
```

All standard options (`wal`, `busyTimeout`, etc.) are supported.

# Migrating to v6

## Breaking changes

### Properties instead of opts

The `opts` getter still exists for backward compatibility and returns all current settings as a plain object. New top-level getters and setters have been added for `namespace` and `clearExpiredInterval`:

```js
store.namespace = 'my-namespace';
store.clearExpiredInterval = 60_000;
```

### Native namespace support

In v5, namespaces were stored as key prefixes in the `key` column (e.g. `key="myns:mykey"` with no namespace column). In v6, the namespace is stored in a dedicated `namespace` column (e.g. `key="mykey"`, `namespace="myns"`). This enables more efficient queries and proper namespace isolation.

The adapter automatically detects old schemas and migrates existing data on connect — no manual migration steps are needed. During migration, prefixed keys like `myns:mykey` are split into `key="mykey"` and `namespace="myns"`.

**Colon caveat:** migration splits on the **first** colon. That is correct for v5 namespaced keys (`namespace:actualKey`, including keys that themselves contain colons). It is incorrect for v5 data stored **without** a namespace where the key itself contains a colon (e.g. `http://example.com` becomes `namespace="http"`, `key="//example.com"`). If you stored colon-containing keys without a namespace, migrate those rows yourself before upgrading.

### Hookified integration

The adapter now extends [Hookified](https://hookified.org) instead of a custom EventEmitter. Events work the same (`on`, `emit`), but hooks are also available via the standard Hookified API.

## New features

### Native TTL support with `expires` column

v6 adds an `expires BIGINT` column to the table. Keyv core computes the absolute expiry and passes it to the adapter as the `expires` argument on `set` / `setMany` — the adapter stores that timestamp directly and does **not** parse the serialized value. A partial index is created on the `expires` column for efficient cleanup queries.

The schema migration is automatic on connect — existing tables get the column added via `ALTER TABLE ... ADD COLUMN`.

### `clearExpired()` method

A new utility method that deletes all rows where the `expires` column is set and the timestamp is in the past:

```js
await store.clearExpired();
```

### `clearExpiredInterval` option

Set an interval (in milliseconds) to automatically call `clearExpired()` on a schedule. Disabled by default (`0`). The timer uses `unref()` so it won't keep the Node.js process alive.

```js
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  clearExpiredInterval: 60_000, // clean up every 60 seconds
});
```

### Bulk operations

New methods for efficient multi-key operations:

- `.setMany(entries)` — bulk upsert with automatic batching (249 entries per batch to stay within SQLite's 999 parameter limit)
- `.getMany(keys)` — bulk retrieve with automatic batching
- `.deleteMany(keys)` — bulk delete with automatic batching
- `.hasMany(keys)` — bulk existence check

### `createKeyv()` helper

A convenience function to create a `Keyv` instance with `KeyvSqlite` as the store in one call:

```js
import { createKeyv } from '@keyv/sqlite';

const keyv = createKeyv('sqlite://path/to/database.sqlite');
```

### Multi-driver support

v6 prefers the built-in `node:sqlite` driver on Node.js 22.13+ (unflagged, still experimental) and `bun:sqlite` on Bun, with `better-sqlite3` bundled as the fallback (replacing the old callback-based `sqlite3` package). You can still select a driver explicitly via the `driver` option. See [Multi-Driver Support](#multi-driver-support) for details.

### Improved iterator

The iterator now uses cursor-based (keyset) pagination instead of `OFFSET`. This handles concurrent modifications during iteration without skipping entries and is more efficient for large datasets.

# Constructor Options

`KeyvSqlite` accepts a connection URI string or an options object:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'sqlite://:memory:'` | SQLite connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keySize` | `number` | `255` | Maximum key column length (VARCHAR length, max 65535). Alias: `keyLength` |
| `namespaceLength` | `number` | `255` | Maximum namespace column length (VARCHAR length) |
| `busyTimeout` | `number` | `undefined` | SQLite [busy timeout](https://sqlite.org/c3ref/busy_timeout.html) in milliseconds |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `wal` | `boolean` | `false` | Enable [WAL mode](https://sqlite.org/wal.html) for better concurrency |
| `clearExpiredInterval` | `number` | `0` | Interval in milliseconds to automatically clear expired entries (0 = disabled) |
| `driver` | `string \| SqliteDriver` | `undefined` | Explicit driver selection (`'better-sqlite3'`, `'node:sqlite'`, `'bun:sqlite'`) or custom driver object. Auto-detected if omitted |

# Properties

## capabilities

Read-only capability descriptor. `capabilities.expires` is `true`, which tells Keyv that `set` / `setMany` accept an **absolute** Unix-ms `expires` timestamp (the v6 storage contract).

- Type: `KeyvStorageCapability`

```js
const store = new KeyvSqlite('sqlite://:memory:');
console.log(store.capabilities.expires); // true
```

## namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()` and `iterator()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvSqlite('sqlite://path/to/database.sqlite');
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

## uri

Get the SQLite connection URI.

- Type: `string`
- Default: `'sqlite://:memory:'`

```js
const store = new KeyvSqlite('sqlite://path/to/database.sqlite');
console.log(store.uri); // 'sqlite://path/to/database.sqlite'
```

## table

Get or set the table name used for storage. The name is sanitized and escaped for safe use in SQL queries to prevent SQL injection. Changing this after construction does not create or migrate the new table — it only changes which table subsequent queries target.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', table: 'cache' });
console.log(store.table); // 'cache'
store.table = 'sessions';
```

## keySize

Get or set the maximum key length (VARCHAR length) for the key column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', keySize: 512 });
console.log(store.keySize); // 512
```

## keyLength

Alias for `keySize`. The constructor option `keyLength` is deprecated; prefer `keySize`.

- Type: `number`
- Default: `255`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', keyLength: 512 });
console.log(store.keyLength); // 512
console.log(store.keySize); // 512
```

## namespaceLength

Get or set the maximum namespace column length (VARCHAR length).

- Type: `number`
- Default: `255`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', namespaceLength: 128 });
console.log(store.namespaceLength); // 128
```

## db

Get the resolved file path for the SQLite database, derived from the URI.

- Type: `string`
- Default: `':memory:'`

```js
const store = new KeyvSqlite('sqlite://data/app.sqlite');
console.log(store.db); // 'data/app.sqlite'
```

## iterationLimit

Get or set the number of rows to fetch per iteration batch.

- Type: `number`
- Default: `10`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', iterationLimit: 50 });
console.log(store.iterationLimit); // 50
```

## wal

Get whether WAL (Write-Ahead Logging) mode is enabled.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvSqlite({ uri: 'sqlite://path/to/database.sqlite', wal: true });
console.log(store.wal); // true
```

## busyTimeout

Get the SQLite busy timeout in milliseconds.

- Type: `number | undefined`
- Default: `undefined`

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', busyTimeout: 5000 });
console.log(store.busyTimeout); // 5000
```

## driver

Get the explicit driver selection. Returns `undefined` when auto-detected.

- Type: `string | SqliteDriver | undefined`
- Default: `undefined` (auto-detected)

```js
const store = new KeyvSqlite({ uri: 'sqlite://:memory:', driver: 'better-sqlite3' });
console.log(store.driver); // 'better-sqlite3'
```

## driverName

Get the name of the resolved driver after connection. This is useful to check which driver was auto-detected.

- Type: `string | undefined`
- Default: `undefined` (set after connection is established)

```js
const store = new KeyvSqlite('sqlite://:memory:');
await store.ready;
console.log(store.driverName); // 'better-sqlite3', 'node:sqlite', 'bun:sqlite', or 'custom'
```

## clearExpiredInterval

Get or set the interval in milliseconds between automatic expired-entry cleanup runs. When set to a value greater than 0, the adapter will automatically call `clearExpired()` at the specified interval. The timer uses `unref()` so it won't keep the Node.js process alive. Setting to 0 disables the automatic cleanup.

- Type: `number`
- Default: `0` (disabled)

```js
// Clean up expired entries every 60 seconds
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  clearExpiredInterval: 60_000,
});
console.log(store.clearExpiredInterval); // 60000

// Disable it later
store.clearExpiredInterval = 0;
```

## ready

A promise that resolves when the database connection and schema setup are complete. You can optionally await this before the first operation to ensure the adapter is fully initialized.

- Type: `Promise<void>`

```js
const store = new KeyvSqlite('sqlite://path/to/database.sqlite');
await store.ready; // connection and schema migration complete
```

## opts

Get a snapshot of all current settings as a plain object. This getter exists for backward compatibility with v5 — prefer the individual property getters above. `keySize` is also exposed under its `keyLength` alias, and the resolved database path is included as `db`.

- Type: `KeyvSqliteOptions & { db: string }`

```js
const store = new KeyvSqlite({
  uri: 'sqlite://:memory:',
  table: 'cache',
  wal: true,
});
console.log(store.opts.uri); // 'sqlite://:memory:'
console.log(store.opts.table); // 'cache'
console.log(store.opts.wal); // true
console.log(store.opts.db); // ':memory:'
```

# Methods

## .set(key, value, expires?)

Set a key-value pair on the store. Returns `true` on success, `false` on failure (an `error` event is also emitted).

The third argument is an **absolute** Unix timestamp in milliseconds (`Date.now() + ttl`), or omitted/`undefined` for no expiry. This is the v6 adapter contract.

When you call `keyv.set(key, value, ttl)` on a `Keyv` instance, `ttl` is still a **relative** duration in milliseconds — Keyv converts it to `expires` before calling the adapter.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `expires` *(number, optional)* - Absolute expiry as Unix ms since epoch.
- Returns: `Promise<boolean>`

```js
await store.set('foo', 'bar');
await store.set('foo', 'bar', Date.now() + 5000); // expires at an absolute timestamp

// Through Keyv, ttl is still relative:
await keyv.set('foo', 'bar', 5000); // expires in 5 seconds
```

## .setMany(entries)

Set multiple key-value pairs at once. Each entry is a `KeyvStorageEntry` (`{ key, value, expires? }`) with an absolute `expires` timestamp. Through a `Keyv` instance, `keyv.setMany()` takes `KeyvEntry` objects (`{ key, value, ttl? }`) with a relative `ttl` and converts them before calling the adapter.

Entries are automatically batched (249 per batch) to stay within SQLite's bind parameter limit. Returns a `boolean[]` with per-entry success tracking. Each batch is atomic — if a batch fails, entries in that batch return `false` while entries in successful batches return `true`. On batch failure, an `error` event is emitted.

- `entries` *(`KeyvStorageEntry[]`)* - Entries to upsert (`{ key, value, expires? }`).
- Returns: `Promise<boolean[]>`

```js
const results = await store.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux', expires: Date.now() + 5000 },
]); // [true, true]
```

## .get(key)

Get a value by key. Returns `undefined` if the key does not exist, has expired, or was stored as SQL `NULL`. Never returns `null`.

- `key` *(string)* - The key to retrieve.
- Returns: `Promise<Value | undefined>`

```js
const value = await store.get('foo'); // 'bar'
```

## .getMany(keys)

Get multiple values at once. Returns an array of values in the same order as the keys, with `undefined` for missing, expired, or SQL `NULL` entries (never `null`).

- `keys` *(string[])* - The keys to retrieve.
- Returns: `Promise<Array<Value | undefined>>`

```js
const values = await store.getMany(['foo', 'baz']); // ['bar', 'qux']
```

## .has(key)

Check if a key exists. Returns a boolean. Expired keys are deleted on read and reported as missing.

- `key` *(string)* - The key to check.
- Returns: `Promise<boolean>`

```js
const exists = await store.has('foo'); // true
```

## .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys. Expired keys are deleted on read and reported as missing.

- `keys` *(string[])* - The keys to check.
- Returns: `Promise<boolean[]>`

```js
const results = await store.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

## .delete(key)

Delete a key. Returns `true` if the key existed, `false` otherwise.

- `key` *(string)* - The key to delete.
- Returns: `Promise<boolean>`

```js
const deleted = await store.delete('foo'); // true
```

## .deleteMany(keys)

Delete multiple keys at once. Returns a `boolean[]` indicating whether each key existed.

- `keys` *(string[])* - The keys to delete.
- Returns: `Promise<boolean[]>`

```js
const results = await store.deleteMany(['foo', 'baz']); // [true, true]
```

## .clear()

Clear all keys in the current namespace. If no namespace is set, entries with an empty namespace are removed.

- Returns: `Promise<void>`

```js
await store.clear();
```

## .clearExpired()

Utility helper method to delete all expired entries from the store. This removes any rows where the `expires` column is set and the timestamp is in the past. This is useful for periodic cleanup of expired data.

- Returns: `Promise<void>`

```js
await store.clearExpired();
```

## .iterator()

Iterate over all key-value pairs. The iterator uses the namespace configured on the instance. Uses cursor-based pagination controlled by the `iterationLimit` option. Expired rows are skipped (not deleted). SQL `NULL` values are yielded as `undefined`.

- Returns: `AsyncGenerator<[string, string | undefined]>`
- Yields: `[key, value]` tuples. Values are never `null`.

```js
for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

## .query(sql, ...params)

Execute a SQL statement against the database. Returns result rows for `SELECT`, `PRAGMA`, and `RETURNING` statements, and an empty array for mutations.

- `sql` *(string)* - The SQL statement to execute.
- `...params` *(unknown[])* - Bind parameters for the statement.
- Returns: `Promise<unknown[]>`

```js
const rows = await store.query('SELECT * FROM keyv WHERE namespace = ?', 'my-namespace');
```

## .close()

Close the underlying database connection. Prefer `.disconnect()`, which also stops the expired-entry cleanup timer.

- Returns: `Promise<void>`

```js
await store.close();
```

## .disconnect()

Disconnect from the SQLite database and release resources. Stops the automatic expired-entry cleanup interval if running, then closes the connection.

- Returns: `Promise<void>`

```js
await store.disconnect();
```

# Events

`KeyvSqlite` extends [Hookified](https://hookified.org) (not Node's `EventEmitter`). The constructor calls `super({ throwOnEmptyListeners: false })`, so emitting `error` with no listener does not throw. Use `on`, `once`, and `emit` the same way as EventEmitter.

An `error` event is emitted on:

- connection / schema-setup failures
- `set` / `setMany` failures
- iterator failures
- `clearExpired` interval failures

```js
const store = new KeyvSqlite('sqlite://path/to/database.sqlite');
store.on('error', (error) => console.error(error));
store.once('error', (error) => console.error('first error only', error));
```

Hooks from the Hookified API (`onHook`, `hook`, `before`, `after`, etc.) are also available. Storage adapters emit events; Keyv core owns operation hooks (`before:get`, `after:set`, etc.). See the [Hookified documentation](https://hookified.org).

# Clearing Expired Keys

When a key is stored with a TTL, the adapter records the expiration timestamp in the `expires` column. Keyv core enforces TTL automatically — expired keys return `undefined` from `get()` and `false` from `has()`, and are lazily deleted from the store when accessed via `get()`, `getMany()`, `has()`, or `hasMany()`. The iterator skips expired rows but does not delete them.

However, expired rows that are never accessed again will remain in the database. The `clearExpired()` method and `clearExpiredInterval` option provide bulk cleanup to remove these stale rows efficiently via SQL, without needing to deserialize every row.

## Automatic cleanup

Set the `clearExpiredInterval` option (in milliseconds) to automatically remove expired entries on a recurring timer. The timer uses `unref()` so it won't keep the Node.js process alive.

```js
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  clearExpiredInterval: 60_000, // clean up every 60 seconds
});
```

You can change or disable the interval at runtime:

```js
// Change to every 5 minutes
store.clearExpiredInterval = 300_000;

// Disable automatic cleanup
store.clearExpiredInterval = 0;
```

## Manual cleanup

Call `clearExpired()` directly to remove all expired entries on demand:

```js
await store.clearExpired();
```

# WAL Mode

By default, SQLite uses the rollback journal for transactions. Enabling [WAL (Write-Ahead Logging)](https://sqlite.org/wal.html) mode can significantly improve concurrency and write performance for most workloads.

```js
const store = new KeyvSqlite({
  uri: 'sqlite://path/to/database.sqlite',
  wal: true,
});
const keyv = new Keyv({ store });
```

**Note:** WAL mode is not supported for in-memory databases (`:memory:`). If enabled for an in-memory database, a warning will be logged and the option will be ignored.

From the [SQLite documentation](https://sqlite.org/wal.html):

> WAL provides more concurrency as readers do not block writers and a writer does not block readers. Reading and writing can proceed concurrently. WAL is significantly faster than the default rollback journal in most scenarios involving a single database connection, and is also faster in many scenarios involving multiple database connections.

# Benchmarks

Simple `set` / `get` benchmarks comparing the built-in SQLite drivers plus an optional `sqlite3` custom-driver setup using in-memory databases with 10,000 pre-generated key-value pairs. Results will vary across machines and runs — they are meant as a relative comparison, not absolute performance numbers.

<!-- BENCHMARK-RESULTS-START -->
| name                |  summary  |   ops/sec |   time/op |  margin  |   samples |
|---------------------|:---------:|----------:|----------:|:--------:|----------:|
| bun set / get       |    🥇     |       64K |      18µs |  ±0.79%  |       57K |
| better set / get    |  -32.0%   |       44K |      25µs |  ±2.34%  |       40K |
| node set / get      |  -32.7%   |       43K |      25µs |  ±2.46%  |       40K |
| sqlite3 set / get   |  -74.7%   |       16K |      67µs |  ±1.25%  |       15K |
<!-- BENCHMARK-RESULTS-END -->

Note: we included `sqlite3` tests in this but by default we do not have it as a dependency as our fallback is `better-sqlite3` now. Please refer to [using sqlite3](#using-sqlite3) if you want to use it.

# License

[MIT © Jared Wray](LICENSE)
