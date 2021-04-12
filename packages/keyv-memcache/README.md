[<img width="100" align="right" src="docs/keyv_logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

# Keyv-Memcache
_Memcache storage adapter for [Keyv](https://github.com/lukechilds/keyv)_


![keyv-memcache-build](https://github.com/jaredwray/keyv-memcache/workflows/keyv-memcache-build/badge.svg)
![keyv-memcache-release](https://github.com/jaredwray/keyv-memcache/workflows/keyv-memcache-release/badge.svg)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv-memcache)](https://github.com/jaredwray/keyv-memcache/blob/master/LICENSE)
[![codecov](https://codecov.io/gh/jaredwray/keyv-memcache/branch/master/graph/badge.svg?token=AHybiBglfQ)](https://codecov.io/gh/jaredwray/keyv-memcache)
[![npm](https://img.shields.io/npm/dm/keyv-memcache)](https://npmjs.com/package/keyv-memcache)

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

## Using Google Cloud

1. Go to https://cloud.google.com/ and sign up.
2. Go to the memcached configuration page in the google cloud console by navigating to Memorystore > Memcached. 
3. On the memcached page (Eg. https://console.cloud.google.com/memorystore/memcached/instances?project=example), Click Create Instance
4. Fill in all mandatory fields as needed. You will need to set up a private service connection.
5. To set up a private service connection, click the Set Up Connection button.
6. Once required fields are complete, click the Create button to create the instance.
7. Google provides further documentation for connecting to and managing your Memecached instance [here](https://cloud.google.com/memorystore/docs/memcached). 

```js

const Keyv = require("keyv");
const KeyvMemcache = require("keyv-memcache");

const memcache = new KeyvMemcache("insert the internal google memcached discovery endpoint");
const keyv = new Keyv({ store: memcache});

```


## License

MIT © Jared Wray
