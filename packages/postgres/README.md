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
const keyv = new Keyv(new KeyvPostgres('postgresql://user:pass@localhost:5432/dbname'), { table: 'cache' });
```

You can specify the `schema` option (default is `public`).

e.g:

```js
const keyv = new Keyv(new KeyvPostgres('postgresql://user:pass@localhost:5432/dbname'), { schema: 'keyv' });
```

You can also use a helper function to create `Keyv` with `KeyvPostgres` store.

```js
import {createKeyv} from '@keyv/postgres';

const keyv = createKeyv({ uri: 'postgresql://user:pass@localhost:5432/dbname', table: 'cache', schema: 'keyv' });
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
