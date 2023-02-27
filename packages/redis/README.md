# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Redis storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)
[![npm](https://img.shields.io/npm/dm/@keyv/redis)](https://npmjs.com/package/@keyv/redis)

Redis storage adapter for [Keyv](https://github.com/jaredwray/keyv).

TTL functionality is handled directly by Redis so no timestamps are stored and expired keys are cleaned up internally.

## Install

```shell
npm install --save keyv @keyv/redis
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('redis://user:pass@localhost:6379');
keyv.on('error', handleConnectionError);
```

Any valid [`Redis`](https://github.com/luin/ioredis#connect-to-redis) options will be passed directly through.

e.g:

```js
const keyv = new Keyv('redis://user:pass@localhost:6379', { disable_resubscribing: true });
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
const KeyvRedis = require('@keyv/redis');
const Keyv = require('keyv');

const keyvRedis = new KeyvRedis('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: keyvRedis });
```

Or reuse a previous Redis instance:

```js
const KeyvRedis = require('@keyv/redis');
const Redis = require('ioredis');
const Keyv = require('keyv');

const redis = new Redis('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis });
```

Or reuse a previous Redis cluster:

```js
const KeyvRedis = require('@keyv/redis');
const Redis = require('ioredis');
const Keyv = require('keyv');

const redis = new Redis.Cluster('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis });
```

*Note if you are re-using an existing Redis instance or cluster:* If you already have added listeners such as `redis.on('error', fn)` &ndash; then you will need to disable the default error listener added by passing a third argument to the constructor with `bindErrorListener` set to false (see example below).

```js
const KeyvRedis = require('@keyv/redis');
const Redis = require('ioredis');
const Keyv = require('keyv');

const redis = new Redis('redis://user:pass@localhost:6379');

redis.on('error', function(err) {
  console.error(err);
});

const keyvRedis = new KeyvRedis(redis, null, false);
const keyv = new Keyv({ store: keyvRedis });
```

This third argument was added for edge cases where the following error is encountered:

```sh
(node:417) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 error listeners added to [KeyvRedis]. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
``

## License

MIT © Jared Wray
