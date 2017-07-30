# keyv-mysql

> MySQL/MariaDB storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-mysql.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-mysql)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-mysql/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-mysql?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-mysql.svg)](https://www.npmjs.com/package/keyv-mysql)

## Install

```shell
npm install --save keyv-mysql
```

## Usage

```js
const Keyv = require('keyv');
const KeyvMysql = require('keyv-mysql');

const mysql = new KeyvMysql('mysql://user:pass@host/db');

const keyv = new Keyv({ store: mysql });
```

## License

MIT © Luke Childs
