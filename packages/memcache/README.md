# @keyv/memcache [<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Memcache storage adapter for [Keyv](https://github.com/jaredwray/keyv)


[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/master/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/memcache)](https://npmjs.com/package/@keyv/memcache)

## Install

```shell
npm install --save @keyv/memcache
```
or 
```
yarn add @keyv/memcache
```

## Usage

```js
const Keyv = require('keyv');
const KeyvMemcache = require('@keyv/memcache');

const memcache = new KeyvMemcache('user:pass@localhost:11211');
const keyv = new Keyv({ store: memcache });

//set 
await keyv.set("foo","bar", 6000) //Expiring time is optional

//get
const obj = await keyv.get("foo");

//delete
await keyv.delete("foo");

//clear
await keyv.clear();

```

## Usage with Namespaces

```js
const Keyv = require('keyv');
const KeyvMemcache = require('@keyv/memcache');

const memcache = new KeyvMemcache('user:pass@localhost:11211');
const keyv1 = new Keyv({ store: memcache, namespace: "namespace1" });
const keyv2 = new Keyv({ store: memcache, namespace: "namespace2" });

//set 
await keyv1.set("foo","bar1", 6000) //Expiring time is optional
await keyv2.set("foo","bar2", 6000) //Expiring time is optional

//get
const obj1 = await keyv1.get("foo"); //will return bar1
const obj2 = await keyv2.get("foo"); //will return bar2

```

# Works with Memcached, Memcachier, Redislabs, and Google Cloud

## Using Memcached 

1. Install Memcached and start an instance
```js

//set the server to the correct address and port 
const server = "localhost:11211"

const Keyv = require("keyv");
const KeyvMemcache = require("@keyv/memcache");

const memcache = new KeyvMemcache(server);
const keyv = new Keyv({ store: memcache});
```

## Using Memcachier 

1. Go to https://www.memcachier.com and signup
2. Create a cache and setup where. 
3. In the screen take the username, password, and url and place it into your code:
```js

//best practice is to not hard code your config in code. 
const user = "";
const pass = "";
const server = "XXX.XXX.XXX.memcachier.com:11211"

const Keyv = require("keyv");
const KeyvMemcache = require("@keyv/memcache");

const memcache = new KeyvMemcache(user +":"+ pass +"@"+ server);
const keyv = new Keyv({ store: memcache});

```

## Using Redislabs Memcache Protocol 

1. Go to https://www.redislabs.com and signup
2. Create a database and make sure to set the `Protocol` to memcached
3. In the screen take the username, password, and `endpoint` (the server) and place it into your code:
```js

//best practice is to not hard code your config in code. 
const user = "";
const pass = "";
const server = "XXX.XXX.XXX.XXX.cloud.redislabs.com:XXX"

const Keyv = require("keyv");
const KeyvMemcache = require("@keyv/memcache");

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
const KeyvMemcache = require("@keyv/memcache");

const memcache = new KeyvMemcache("insert the internal google memcached discovery endpoint");
const keyv = new Keyv({ store: memcache});

```


## License

MIT © Jared Wray
