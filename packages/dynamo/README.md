# @keyv/dynamo [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> DynamoDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/dynamo.svg)](https://www.npmjs.com/package/@keyv/dynamo)
[![npm](https://img.shields.io/npm/dm/@keyv/dynamo)](https://npmjs.com/package/@keyv/dynamo)

DynamoDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Uses TTL indexes to automatically remove expired documents. However [DynamoDB doesn't guarantee data will be deleted immediately upon expiration](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

## Install

```shell
npm install --save keyv @keyv/dynamo
```

## Usage

```js
import Keyv from 'keyv';
import KeyvDynamo from '@keyv/dynamo';

const keyv = new Keyv(new KeyvDynamo());
keyv.on('error', handleConnectionError);
```

You can specify the table name, by default `'keyv'` is used.

e.g:

```js
const keyv = new KeyvDynamo({ tableName: 'cacheTable' });
```

## License

[MIT © Jared Wray](LISCENCE)
