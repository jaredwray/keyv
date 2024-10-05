# @keyv/tiered [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Tiered storage adapter for Keyv to manage local and remote store as one for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/tiered.svg)](https://www.npmjs.com/package/@keyv/tiered)
[![npm](https://img.shields.io/npm/dm/@keyv/tiered)](https://npmjs.com/package/@keyv/tiered)

# Feature is Deprecated

This feature is deprecated and will be removed in 2025 as it is no longer needed. 

`offline` and `tiered` mode for caching is built into the core [Cacheable](https://cacheable.org) library which uses Keyv under the hood. Please use the `Cacheable` library for `offline` and `tiered` caching.

## Install

```shell
npm install --save keyv @keyv/tiered
```

## Usage

First, you need to provide your `local` and `remote` stores to be used, being possible to use any [Keyv storage adapter](https://github.com/jaredwray/keyv#storage-adapters):

```js
import Keyv from 'keyv';
import KeyvTiered from '@keyv/tiered';
import KeyvSqlite from '@keyv/sqlite';

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

[MIT © Jared Wray](LISCENCE)