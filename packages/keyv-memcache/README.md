# @keyv-memcache [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

> Memcache storage adapter for Keyv


[![Build Status](https://travis-ci.org/jaredwray/keyv-memcache.svg?branch=master)](https://travis-ci.org/jaredwray/keyv-memcache)
[![npm](https://img.shields.io/npm/v/@keyv-memcache.svg)](https://www.npmjs.com/package/@keyv-memcache)

MemCache storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save @keyv-memcache
```
or 
```
yarn add @keyv-memcache
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('memcache://user:pass@localhost:11211');
keyv.on('error', handleConnectionError);
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
const Keyv = require('keyv');
const KeyvMemcache = require('@keyv-memcache');

const memcache = new KeyvMemcache('memcache://user:pass@localhost:11211');
const keyv = new Keyv({ store: memcache });
```

## License

MIT © Jared Wray
