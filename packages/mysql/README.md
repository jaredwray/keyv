# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)
[![npm](https://img.shields.io/npm/dm/@keyv/mysql)](https://npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Install

```shell
npm install --save keyv @keyv/mysql
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('mysql://user:pass@localhost:3306/dbname');
keyv.on('error', handleConnectionError);
```

You can specify a custom table with the `table` option and the primary key size with `keySize`.

e.g:

```js
const keyv = new Keyv('mysql://user:pass@localhost:3306/dbname', {
  table: 'cache',
  keySize: 255
});
```

## SSL

```js
const fs = require('fs');
const path = require('path');
const KeyvMysql = require('@keyv/mysql');

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
};

const keyv = new KeyvMysql({uri, ...options});

```

**Note:** Some MySQL/MariaDB installations won't allow a key size longer than 767 bytes. If you get an error on table creation try reducing `keySize` to 191 or lower. [#5](https://github.com/jaredwray/keyv-sql/issues/5)

## License

MIT © Jared Wray
