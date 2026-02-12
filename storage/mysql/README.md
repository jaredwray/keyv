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
