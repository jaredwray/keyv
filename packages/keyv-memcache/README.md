[<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

# Keyv-Memcache
_Memcache storage adapter for [Keyv](https://github.com/lukechilds/keyv)_


[![Build Status](https://travis-ci.org/jaredwray/keyv-memcache.svg?branch=master)](https://travis-ci.org/jaredwray/keyv-memcache)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv-memcache)](https://github.com/jaredwray/keyv-memcache/blob/master/LICENSE)

## Install

```shell
npm install --save keyv-memcache
```
or 
```
yarn add keyv-memcache
```

## Usage

```js
const Keyv = require('keyv');
const KeyvMemcache = require('keyv-memcache');

const memcache = new KeyvMemcache('user:pass@localhost:11211');
const keyv = new Keyv({ store: memcache });

//set 
await keyv.set("foo","bar", 6000) //Expiring time is optional

//get
let obj = await keyv.get("foo");

//delete
await keyv.delete("foo");

//clear
await keyv.clear();

```

## License

MIT © Jared Wray
