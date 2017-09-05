# @keyv/mongo [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> MongoDB storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-mongo.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-mongo)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-mongo/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-mongo?branch=master)
[![npm](https://img.shields.io/npm/v/@keyv/mongo.svg)](https://www.npmjs.com/package/@keyv/mongo)

MongoDB storage adapter for [Keyv](https://github.com/lukechilds/keyv).

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

MIT © Luke Childs
