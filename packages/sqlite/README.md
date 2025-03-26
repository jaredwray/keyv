# @keyv/sqlite [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> SQLite storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/sqlite.svg)](https://www.npmjs.com/package/@keyv/sqlite)
[![npm](https://img.shields.io/npm/dm/@keyv/sqlite)](https://npmjs.com/package/@keyv/sqlite)

SQLite storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save keyv @keyv/sqlite
```

## Usage

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const keyv = new Keyv(new KeyvSqlite('sqlite://path/to/database.sqlite'));
keyv.on('error', handleConnectionError);
```

You can specify the `table` and [`busyTimeout`](https://sqlite.org/c3ref/busy_timeout.html) option.

e.g:

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

const keyvSqlite = new KeyvSqlite('sqlite://path/to/database.sqlite', {
  table: 'cache',
  busyTimeout: 10000
});

const keyv = new Keyv({ store: keyvSqlite }); 
```

You can also use a helper function to create `Keyv` with `KeyvSqlite` store.

```js
import {createKeyv} from '@keyv/sqlite';

const keyv = createKeyv('sqlite://path/to/database.sqlite');
```


## License

[MIT © Jared Wray](LICENCE)

