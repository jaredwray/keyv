# @keyv/mongo [<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MongoDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mongo.svg)](https://www.npmjs.com/package/@keyv/mongo)
[![npm](https://img.shields.io/npm/dm/@keyv/mongo)](https://npmjs.com/package/@keyv/mongo)

MongoDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Uses TTL indexes to automatically remove expired documents. However [MongoDB doesn't guarantee data will be deleted immediately upon expiration](https://docs.mongodb.com/manual/core/index-ttl/#timing-of-the-delete-operation), so expiry dates are revalidated in Keyv.

## Install

```shell
npm install --save keyv @keyv/mongo
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('mongodb://user:pass@localhost:27017/dbname');
keyv.on('error', handleConnectionError);
```

You can specify the collection name, by default `'keyv'` is used.

e.g:

```js
const keyv = new Keyv('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' });
```

## License

MIT © Jared Wray
