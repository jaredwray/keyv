# @keyv/mysql [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-mysql.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-mysql)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-mysql/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-mysql?branch=master)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/lukechilds/keyv).

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

**Note:** Some MySQL/MariaDB installations won't allow a key size longer than 767 bytes. If you get an error on table creation try reducing `keySize` to 191 or lower. [#5](https://github.com/lukechilds/keyv-sql/issues/5)

## License

MIT © Luke Childs
