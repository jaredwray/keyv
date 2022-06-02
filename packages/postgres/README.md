# @keyv/postgres [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> PostgreSQL storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/btestsuild.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/postgres.svg)](https://www.npmjs.com/package/@keyv/postgres)
[![npm](https://img.shields.io/npm/dm/@keyv/postgres)](https://npmjs.com/package/@keyv/postgres)

PostgreSQL storage adapter for [Keyv](https://github.com/lukechilds/keyv).

Requires Postgres 9.5 or newer for `ON CONFLICT` support to allow performant upserts. [Why?](https://stackoverflow.com/questions/17267417/how-to-upsert-merge-insert-on-duplicate-update-in-postgresql/17267423#17267423)

## Install

```shell
npm install --save keyv @keyv/postgres
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('postgresql://user:pass@localhost:5432/dbname');
keyv.on('error', handleConnectionError);
```

You can specify the `table` option.

e.g:

```js
const keyv = new Keyv('postgresql://user:pass@localhost:5432/dbname', { table: 'cache' });
```

## Testing

When testing you can use our `docker-compose` postgresql instance by having docker installed and running. This will start a postgres server, run the tests, and stop the server:

```shell
npm run test:db
```

To run each step manually do the following to start the server, and run the tests:

```shell
npm run test:postgres:start
npm run test
npm run test:postgres:stop
```

## License

MIT © Jared Wray & Luke Childs
