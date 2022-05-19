# @keyv/tiered [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> Tiered storage adapter for Keyv to manage local and remote store as one for Keyv 
[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/master/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/sqlite.svg)](https://www.npmjs.com/package/@keyv/sqlite)

Tiered storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save keyv @keyv/tiered
```

## Usage

First, you need to provide your `local` and `remote` stores to be used, being possible to use any [Keyv storage adapter](https://keyv.js.org/#/?id=storage-adapters-1#/?id=storage-adapters-1#/?id=storage-adapters-1):

```js
const Keyv = require('keyv');
const KeyvSqlite = require('@keyv/sqlite');
const KeyvTiered = require('@keyv/tiered');
const remoteStore = () => new Keyv({
	store: new KeyvSqlite({
		uri: 'sqlite://test/testdb.sqlite',
		busyTimeout: 30_000,
	}),
});
const localStore = () => new Keyv();
const remote = remoteStore();
const local = localStore();
const store = new KeyvTiered({remote, local});
const keyv = new Keyv({store});
keyv.on('error', handleConnectionError);
```

## API

### KeyvTiered(\[options])

#### options

##### local

Type: `Object`<br/>
Default: `new Keyv()`

A keyv instance to be used as local strategy.

##### remote

Type: `Object`<br/>
Default: `new Keyv()`

A keyv instance to be used as remote strategy.

##### validator

Type: `Function`<br/>
Default: `() =>  true`

The validator function is used as a precondition to determining is remote storage should be checked.

## License

MIT © Jared Wray & Luke Childs