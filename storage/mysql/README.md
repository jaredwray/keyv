# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)
[![npm](https://img.shields.io/npm/dm/@keyv/mysql)](https://npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Properties](#properties)
- [Methods](#methods)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value)](#setkey-value)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.iterator(namespace)](#iteratornamespace)
  - [.disconnect()](#disconnect)
- [SSL](#ssl)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/mysql
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql('mysql://user:pass@localhost:3306/dbname'));
keyv.on('error', handleConnectionError);
```

You can specify a custom table with the `table` option and the primary key size with `keySize`.
If you want to use native MySQL scheduler to delete expired keys, you can specify `intervalExpiration` in seconds.

e.g:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keySize: 255,
  intervalExpiration: 60
}));
```

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `uri` | `string` | `"mysql://localhost"` | MySQL connection URI string |
| `table` | `string` | `"keyv"` | Name of the MySQL table used for storage |
| `keySize` | `number` | `255` | Maximum size of the key column (VARCHAR length) |
| `dialect` | `string` | `"mysql"` | Database dialect |
| `iterationLimit` | `string \| number` | `10` | Number of rows to fetch per batch during iteration. Accepts both numbers and string representations of numbers (e.g., `10` or `"10"`) |
| `intervalExpiration` | `number` | `undefined` | Interval in seconds for automatic expiration cleanup via MySQL event scheduler |
| `ssl` | `object` | `undefined` | SSL configuration object passed to the MySQL connection |

The `KeyvMysql` constructor also accepts any valid `mysql2` [ConnectionOptions](https://sidorares.github.io/node-mysql2/docs/documentation/connections) such as `host`, `port`, `user`, `password`, and `database`. These are parsed from the `uri` if not provided directly.

## Methods

### .get(key)

Returns the value for the given key. Returns `undefined` if the key does not exist.

```js
const value = await keyvMysql.get('foo');
```

### .getMany(keys)

Returns an array of values for the given keys. Returns `undefined` for any key that does not exist.

```js
const values = await keyvMysql.getMany(['foo', 'bar']);
```

### .set(key, value)

Sets a value for the given key. If the key already exists, it will be updated.

```js
await keyvMysql.set('foo', 'bar');
```

### .setMany(entries)

Set multiple key-value pairs at once. Each entry is an object with `key` and `value` properties.

```js
await keyvMysql.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux' },
]);
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await keyvMysql.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store. Returns `true` if at least one key was deleted, `false` otherwise.

```js
const deleted = await keyvMysql.deleteMany(['foo', 'bar']);
```

### .clear()

Clears all entries from the store. If a namespace is set, only entries within that namespace are cleared.

```js
await keyvMysql.clear();
```

### .has(key)

Returns `true` if the key exists in the store, `false` otherwise.

```js
const exists = await keyvMysql.has('foo');
```

### .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys.

```js
await keyvMysql.set('foo', 'bar');
await keyvMysql.set('baz', 'qux');

const results = await keyvMysql.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

### .iterator(namespace)

Returns an async iterator for iterating over all key-value pairs in the store. Uses keyset pagination to efficiently handle large datasets.

```js
for await (const [key, value] of keyvMysql.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Disconnects from the MySQL database and closes the connection pool.

```js
await keyvMysql.disconnect();
```

## SSL

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import fs from 'fs';

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
};

const keyvMysql = new KeyvMysql('mysql://user:pass@localhost:3306/dbname', options);
const keyv = new Keyv({ store: keyvMysql });
```

## License

[MIT © Jared Wray](LISCENCE)
