# @keyv/postgres [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> PostgreSQL storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/btestsuild.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/postgres.svg)](https://www.npmjs.com/package/@keyv/postgres)
[![npm](https://img.shields.io/npm/dm/@keyv/postgres)](https://npmjs.com/package/@keyv/postgres)

PostgreSQL storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Requires Postgres 9.5 or newer for `ON CONFLICT` support to allow performant upserts. [Why?](https://stackoverflow.com/questions/17267417/how-to-upsert-merge-insert-on-duplicate-update-in-postgresql/17267423#17267423)

## Install

```shell
npm install --save keyv @keyv/postgres
```

## Usage

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

## Using an Unlogged Table for Performance

By default, the adapter creates a logged table. If you want to use an unlogged table for performance, you can pass the `useUnloggedTable` option to the constructor.

```js
const keyvPostgres = new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', useUnloggedTable: true });
const keyv = new Keyv(keyvPostgres);
```

From the [PostgreSQL documentation](https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-UNLOGGED):

If specified, the table is created as an unlogged table. Data written to unlogged tables is not written to the write-ahead log (see Chapter 28), which makes them considerably faster than ordinary tables. However, they are not crash-safe: an unlogged table is automatically truncated after a crash or unclean shutdown. The contents of an unlogged table are also not replicated to standby servers. Any indexes created on an unlogged table are automatically unlogged as well.

If this is specified, any sequences created together with the unlogged table (for identity or serial columns) are also created as unlogged.

## Connection pooling

The adapter automatically uses the default settings on the `pg` package for connection pooling. You can override these settings by passing the options to the constructor such as setting the `max` pool size.

```js
const keyv = new Keyv(new KeyvPostgres({ uri: 'postgresql://user:pass@localhost:5432/dbname', max: 20 }));
```

## Testing

When testing you can use our `docker compose` postgresql instance by having docker installed and running. This will start a postgres server, run the tests, and stop the server:

At the root of the Keyv mono repo:
```shell
pnpm test:services:start
```

To just test the postgres adapter go to the postgres directory (packages/postgres) and run:
```shell
pnpm test
```

## License

[MIT © Jared Wray](LISCENCE)
