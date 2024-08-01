# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

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
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
keyv.on('error', handleConnectionError);
```

Any valid [`Redis`](https://github.com/luin/ioredis#connect-to-redis) options will be passed directly through.

e.g:

```js
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { disable_resubscribing: true }));
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyvRedis = new KeyvRedis('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: keyvRedis });
```

Or reuse a previous Redis instance:

```js
import Keyv from 'keyv';
import Redis from 'ioredis';
import KeyvRedis from '@keyv/redis';

const redis = new Redis('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis });
```

Or reuse a previous Redis cluster:

```js
import Keyv from 'keyv';
import Redis from 'ioredis';
import KeyvRedis from '@keyv/redis';

const redis = new Redis.Cluster('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis });
```
## Options

### useRedisSets

The `useRedisSets` option lets you decide whether to use Redis sets for key management. By default, this option is set to `true`.

When `useRedisSets` is enabled (`true`):

- A namespace for the Redis sets is created, and all created keys are added to this. This allows for group management of keys.
- When a key is deleted, it's removed not only from the main storage but also from the Redis set.
- When clearing all keys (using the `clear` function), all keys in the Redis set are looked up for deletion. The set itself is also deleted.

**Note**: In high-performance scenarios, enabling `useRedisSets` might lead to memory leaks. If you're running a high-performance application or service, it is recommended to set `useRedisSets` to `false`.

If you decide to set `useRedisSets` as `false`, keys will be handled individually and Redis sets won't be utilized.

However, please note that setting `useRedisSets` to `false` could lead to performance issues in production when using the `clear` function, as it will need to iterate over all keys to delete them.

#### Example

Here's how you can use the `useRedisSets` option:

```js
import Keyv from 'keyv';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { useRedisSets: false }));
```

## License

[MIT © Jared Wray](LISCENCE)
