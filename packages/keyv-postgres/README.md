# @keyv/postgres [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> PostgreSQL storage adapter for Keyv

[![build](https://github.com/lukechilds/keyv-postgres/actions/workflows/build.yaml/badge.svg)](https://github.com/lukechilds/keyv-postgres/actions/workflows/build.yaml)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-postgres/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-postgres?branch=master)
[![npm](https://img.shields.io/npm/v/@keyv/postgres.svg)](https://www.npmjs.com/package/@keyv/postgres)

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

When testing you can use our `docker-compose` postgresql instance by having docker installed and running:

```shell
npm run test:postgres:start
```

This will start the postgres instances and then you can run your tests:

```shell
npm run test
```

To shutdown the postgres instances run the following command:

```shell
npm run test:postgres:stop
```


## License

MIT © Luke Childs
