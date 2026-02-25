# @keyv/mongo [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MongoDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mongo.svg)](https://www.npmjs.com/package/@keyv/mongo)
[![npm](https://img.shields.io/npm/dm/@keyv/mongo)](https://npmjs.com/package/@keyv/mongo)

MongoDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Uses TTL indexes to automatically remove expired documents. However [MongoDB doesn't guarantee data will be deleted immediately upon expiration](https://docs.mongodb.com/manual/core/index-ttl/#timing-of-the-delete-operation), so expiry dates are revalidated in Keyv.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [url](#url)
  - [collection](#collection)
  - [namespace](#namespace)
  - [useGridFS](#usegridfs)
  - [db](#db)
  - [readPreference](#readpreference)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/mongo
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMongo from '@keyv/mongo';

const keyv = new Keyv(new KeyvMongo('mongodb://user:pass@localhost:27017/dbname'));
keyv.on('error', handleConnectionError);
```

You can specify the collection name, by default `'keyv'` is used.

e.g:

```js
const keyv = new Keyv('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' });
```

You can also use the `createKeyv` helper function to create a `Keyv` instance with `KeyvMongo` as the store:

```js
import { createKeyv } from '@keyv/mongo';

const keyv = createKeyv('mongodb://user:pass@localhost:27017/dbname');
```

## Constructor Options

The `KeyvMongo` constructor accepts a connection URI string or an options object:

```js
// With URI string
const store = new KeyvMongo('mongodb://user:pass@localhost:27017/dbname');

// With options object
const store = new KeyvMongo({
  url: 'mongodb://user:pass@localhost:27017/dbname',
  collection: 'cache',
  db: 'mydb',
  useGridFS: false,
});

// With URI string and additional options
const store = new KeyvMongo('mongodb://user:pass@localhost:27017/dbname', { collection: 'cache' });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | `'mongodb://127.0.0.1:27017'` | MongoDB connection URI |
| `collection` | `string` | `'keyv'` | Collection name for storage |
| `namespace` | `string \| undefined` | `undefined` | Namespace prefix for keys |
| `useGridFS` | `boolean` | `false` | Whether to use GridFS for storing values |
| `db` | `string \| undefined` | `undefined` | Database name |
| `readPreference` | `ReadPreference \| undefined` | `undefined` | MongoDB read preference for GridFS operations |

Any additional options are passed through to the MongoDB driver as `MongoClientOptions`.

## Properties

All configuration options are exposed as properties with getters and setters on the `KeyvMongo` instance. You can read or update them after construction.

### url

Get or set the MongoDB connection URI.

- Type: `string`
- Default: `'mongodb://127.0.0.1:27017'`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
console.log(store.url); // 'mongodb://user:pass@localhost:27017/dbname'
```

### collection

Get or set the collection name used for storage.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
console.log(store.collection); // 'keyv'
store.collection = 'cache';
```

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

### useGridFS

Get or set whether GridFS is used for storing values. When enabled, values are stored using MongoDB's GridFS specification, which is useful for storing large files.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017/dbname', useGridFS: true });
console.log(store.useGridFS); // true
```

### db

Get or set the database name for the MongoDB connection.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMongo({ url: 'mongodb://user:pass@localhost:27017', db: 'mydb' });
console.log(store.db); // 'mydb'
```

### readPreference

Get or set the MongoDB read preference for GridFS operations.

- Type: `ReadPreference | undefined`
- Default: `undefined`

```js
import { ReadPreference } from 'mongodb';

const store = new KeyvMongo({
  url: 'mongodb://user:pass@localhost:27017/dbname',
  useGridFS: true,
  readPreference: ReadPreference.SECONDARY,
});
console.log(store.readPreference); // ReadPreference.SECONDARY
```

## License

[MIT © Jared Wray](LISCENCE)
