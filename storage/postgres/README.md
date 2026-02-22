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
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [uri](#uri)
  - [table](#table)
  - [keySize](#keysize)
  - [schema](#schema)
  - [ssl](#ssl)
  - [iterationLimit](#iterationlimit)
  - [useUnloggedTable](#useunloggedtable)
  - [namespacePrefix](#namespaceprefix)
  - [namespace](#namespace)
- [Namespace-Per-Table](#namespace-per-table)
- [Using an Unlogged Table for Performance](#using-an-unlogged-table-for-performance)
- [Connection Pooling](#connection-pooling)
- [SSL/TLS Connections](#ssltls-connections)
- [API](#api)
  - [.set(key, value)](#setkey-value)
  - [.setMany(entries)](#setmanyentries)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.iterator(namespace?)](#iteratornamespace)
  - [.disconnect()](#disconnect)
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

# Constructor Options

`KeyvPostgres` accepts a connection URI string or an options object. The options object accepts the following properties along with any [`PoolConfig`](https://node-postgres.com/apis/pool) properties from the `pg` library (e.g. `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'postgresql://localhost:5432'` | PostgreSQL connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keySize` | `number` | `255` | Maximum key column size (VARCHAR length) |
| `schema` | `string` | `'public'` | PostgreSQL schema name (created automatically if it doesn't exist) |
| `ssl` | `object` | `undefined` | SSL/TLS configuration passed to the `pg` driver |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `useUnloggedTable` | `boolean` | `false` | Use a PostgreSQL UNLOGGED table for better write performance |
| `namespacePrefix` | `string` | `'keyv_'` | Prefix for namespace-per-table table names (e.g., `keyv_` + `users` = table `keyv_users`) |

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

## keySize

Get or set the maximum key size (VARCHAR length) for the key column.

- Type: `number`
- Default: `255`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', keySize: 512 });
console.log(store.keySize); // 512
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

## namespacePrefix

Get or set the prefix used for namespace-per-table table names. When a namespace is set, the table name becomes `{namespacePrefix}{namespace}` (e.g., `keyv_users`). When no namespace is set, the trailing underscore is stripped and the table name is just the prefix base (e.g., `keyv`).

- Type: `string`
- Default: `'keyv_'`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', namespacePrefix: 'cache_' });
console.log(store.namespacePrefix); // 'cache_'
```

## namespace

Get or set the namespace for the adapter. When set, the adapter uses a dedicated table named `{namespacePrefix}{namespace}` (e.g., `keyv_sessions`). This provides physical isolation between namespaces.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' });
store.namespace = 'sessions';
console.log(store.namespace); // 'sessions'
// Data is stored in table: keyv_sessions
```

# Namespace-Per-Table

Each namespace automatically gets its own PostgreSQL table. The table name is computed from the `namespacePrefix` and the `namespace`:

- Namespace `"users"` with default prefix → table `keyv_users`
- Namespace `"sessions"` with prefix `"cache_"` → table `cache_sessions`
- No namespace with default prefix → table `keyv`

Tables are created automatically when first accessed.

```js
import Keyv from 'keyv';
import KeyvPostgres from '@keyv/postgres';

// Two separate namespaces, each with their own table
const users = new Keyv({
  store: new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' }),
  namespace: 'users',
});

const sessions = new Keyv({
  store: new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname' }),
  namespace: 'sessions',
});

// Data is isolated — clearing users does not affect sessions
await users.set('user1', { name: 'Alice' });
await sessions.set('sess1', { token: 'abc' });
await users.clear(); // Only clears the keyv_users table
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

# API

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
