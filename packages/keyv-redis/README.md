# keyv-redis [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

> Redis storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-redis.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-redis)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-redis/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-redis?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-redis.svg)](https://www.npmjs.com/package/keyv-redis)

Redis storage adapter for [Keyv](https://github.com/lukechilds/keyv). TTL functionality is handled directly by Redis so no timestamps are stored and expired keys are cleaned up internally.

## Install

```shell
npm install --save keyv keyv-redis
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('redis://user:pass@localhost:6379');
keyv.on('error', handleConnectionError);
```

You can pass any valid options directly through to the Redis client.

```js
const keyv = new Keyv('redis://user:pass@localhost:6379', { disable_resubscribing: true });
```
View [`redis.createClient()`](https://github.com/NodeRedis/node_redis#rediscreateclient) documentation for more information in accepted arguments.

## License

MIT © Luke Childs
