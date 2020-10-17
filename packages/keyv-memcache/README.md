[<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

# Keyv-Memcache
_Memcache storage adapter for [Keyv](https://github.com/lukechilds/keyv)_


[![Build Status](https://github.com/jaredwray/keyv-memcache/workflows/keyv-memcache-build/badge.svg)](https://github.com/jaredwray/keyv-memcache/actions)
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
let obj2 = await keyv2.get("foo"); //will return bar2

```

## Using Memcachier 

1. Go to https://www.memcachier.com and signup
2. Create a cache and setup where. 
3. In the screen take the username, password, and url and place it into your code:
```js

//best practice is to not hard code your config in code. 
let user = ""; 
let pass = "";
let server = "XXX.XXX.XXX.memcachier.com:11211"

const Keyv = require("keyv");
const KeyvMemcache = require("keyv-memcache");

const memcache = new KeyvMemcache(user +":"+ pass +"@"+ server);
const keyv = new Keyv({ store: memcache});

```

## Using Redislabs Memcache Protocol 

1. Go to https://www.redislabs.com and signup
2. Create a database and make sure to set the `Protocol` to memcached
3. In the screen take the username, password, and `endpoint` (the server) and place it into your code:
```js

//best practice is to not hard code your config in code. 
let user = ""; 
let pass = "";
let server = "XXX.XXX.XXX.XXX.cloud.redislabs.com:XXX"

const Keyv = require("keyv");
const KeyvMemcache = require("keyv-memcache");

const memcache = new KeyvMemcache(user +":"+ pass +"@"+ server);
const keyv = new Keyv({ store: memcache});

```

## License

MIT © Jared Wray
