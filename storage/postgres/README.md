# @keyv/postgres [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> PostgreSQL storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/btestsuild.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/postgres.svg)](https://www.npmjs.com/package/@keyv/postgres)
[![npm](https://img.shields.io/npm/dm/@keyv/postgres)](https://npmjs.com/package/@keyv/postgres)

PostgreSQL storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Requires Postgres 9.5 or newer for `ON CONFLICT` support to allow performant upserts. [Why?](https://stackoverflow.com/questions/17267417/how-to-upsert-merge-insert-on-duplicate-update-in-postgresql/17267423#17267423)

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Options](#options)
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

const keyv = new Keyv(new KeyvPostgres('postgresql://user:pass@localhost:5432/dbname'));
keyv.on('error', handleConnectionError);
```

You can specify the `table` option.

e.g:

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', table: 'cache' });
const keyv = new Keyv(keyvPostgres);
```

You can specify the `schema` option (default is `public`).

e.g:

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', schema: 'keyv' });
const keyv = new Keyv(keyvPostgres);
```

You can also use the `createKeyv` helper function to create `Keyv` with `KeyvPostgres` store.

```js
import {createKeyv} from '@keyv/postgres';

const keyv = createKeyv({ uri: 'postgresql://user:pass@localhost:5432/dbname', table: 'cache', schema: 'keyv' });
```

# Options

`KeyvPostgres` accepts the following options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `"postgresql://localhost:5432"` | PostgreSQL connection URI |
| `table` | `string` | `"keyv"` | Table name for key-value storage |
| `keySize` | `number` | `255` | Maximum key column size (VARCHAR length) |
| `schema` | `string` | `"public"` | PostgreSQL schema name (created automatically if it doesn't exist) |
| `ssl` | `object` | `undefined` | SSL/TLS configuration passed to the `pg` driver |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `useUnloggedTable` | `boolean` | `false` | Use a PostgreSQL UNLOGGED table for better write performance |

`KeyvPostgresOptions` extends `PoolConfig` from the [`pg`](https://node-postgres.com/apis/pool) library, so any pool configuration options (e.g. `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`) can be passed directly.

# Using an Unlogged Table for Performance

By default, the adapter creates a logged table. If you want to use an unlogged table for performance, you can pass the `useUnloggedTable` option to the constructor.

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', useUnloggedTable: true });
const keyv = new Keyv(keyvPostgres);
```

From the [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-UNLOGGED):

If specified, the table is created as an unlogged table. Data written to unlogged tables is not written to the write-ahead log (see Chapter 28), which makes them considerably faster than ordinary tables. However, they are not crash-safe: an unlogged table is automatically truncated after a crash or unclean shutdown. The contents of an unlogged table are also not replicated to standby servers. Any indexes created on an unlogged table are automatically unlogged as well.

If this is specified, any sequences created together with the unlogged table (for identity or serial columns) are also created as unlogged.

# Connection Pooling

The adapter automatically uses the default settings on the `pg` package for connection pooling. You can override these settings by passing the options to the constructor such as setting the `max` pool size.

```js
const keyv = new Keyv(new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', max: 20 }));
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
const keyv = new Keyv(keyvPostgres);
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

Iterate over all key-value pairs, optionally filtered by namespace. Uses cursor-based pagination controlled by the `iterationLimit` option.

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
