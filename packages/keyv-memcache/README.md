# @kkeyv-memcache [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

> Memcache storage adapter for Keyv

//TODO: UPDATE THESE AS THE PROJECT IS BUILDING
[![Build Status](https://travis-ci.org/lukechilds/keyv-redis.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-redis)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-redis/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-redis?branch=master)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)

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

const keyv = new Keyv('memcache://user:pass@localhost:6379');
keyv.on('error', handleConnectionError);
```

Any valid [`redis.createClient()`](https://github.com/NodeRedis/node_redis#rediscreateclient) options will be passed directly through.

e.g:

```js
const keyv = new Keyv('redis://user:pass@localhost:6379', { disable_resubscribing: true });
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
const Keyv = require('keyv');
const KeyvMemcache = require('@keyv-memcache');

const memcache = new KeyvMemcache('memcache://user:pass@localhost:6379');
const keyv = new Keyv({ store: memcache });
```

## License

MIT © Jared Wray
