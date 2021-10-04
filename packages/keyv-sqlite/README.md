# @keyv/sqlite [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> SQLite storage adapter for Keyv

[![build](https://github.com/lukechilds/keyv-sqlite/actions/workflows/build.yaml/badge.svg)](https://github.com/lukechilds/keyv-sqlite/actions/workflows/build.yaml)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-sqlite/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-sqlite?branch=master)
[![npm](https://img.shields.io/npm/v/@keyv/sqlite.svg)](https://www.npmjs.com/package/@keyv/sqlite)

SQLite storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save keyv @keyv/sqlite
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('sqlite://path/to/database.sqlite');
keyv.on('error', handleConnectionError);
```

You can specify the `table` and [`busyTimeout`](https://sqlite.org/c3ref/busy_timeout.html) option.

e.g:

```js
const keyv = new Keyv('sqlite://path/to/database.sqlite', {
  table: 'cache',
  busyTimeout: 10000
});
```

## License

MIT © Luke Childs
