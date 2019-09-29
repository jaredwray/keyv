[<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

# Keyv-Memcache
_Memcache storage adapter for [Keyv](https://github.com/lukechilds/keyv)_


[![Build Status](https://travis-ci.org/jaredwray/keyv-memcache.svg?branch=master)](https://travis-ci.org/jaredwray/keyv-memcache)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv-memcache)](https://github.com/jaredwray/keyv-memcache/blob/master/LICENSE)
[![codecov](https://codecov.io/gh/jaredwray/keyv-memcache/branch/master/graph/badge.svg)](https://codecov.io/gh/jaredwray/keyv-memcache)
[![npm](https://img.shields.io/npm/dm/keyv-memcache)](https://npmjs.com/packages/keyv-memcache)

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

## Usage with Namespaces

```js
const Keyv = require('keyv');
const KeyvMemcache = require('keyv-memcache');

const memcache = new KeyvMemcache('user:pass@localhost:11211');
const keyv1 = new Keyv({ store: memcache, namespace: "namespace1" });
const keyv2 = new Keyv({ store: memcache, namespace: "namespace2" });

//set 
await keyv1.set("foo","bar1", 6000) //Expiring time is optional
await keyv2.set("foo","bar2", 6000) //Expiring time is optional

//get
let obj1 = await keyv1.get("foo"); //will return bar1
let obj2 = await keyv1.get("foo"); //will return bar2

```

## License

MIT © Jared Wray
