# @keyv/valkey [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Valkey storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey.svg)](https://www.npmjs.com/package/@keyv/valkey)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey)](https://npmjs.com/package/@keyv/valkey)

[Valkey](https://valkey.io) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Valkey is the open source replacement to Redis which decided to do a [dual license](https://redis.com/blog/redis-adopts-dual-source-available-licensing/) approach moving forward. Valkey is a drop-in replacement for Redis and is fully compatible with the Redis protocol.

We are using the [iovalkey](https://www.npmjs.com/package/iovalkey) which is a Node.js client for Valkey based on the `ioredis` client.

# Install

```shell
npm install --save keyv @keyv/valkey
```

# Usage

This is using the helper `createKeyv` function to create a Keyv instance with the Valkey storage adapter:

```js
import {createKeyv} from '@keyv/valkey';

const keyv = createKeyv('redis://localhost:6379');
keyv.on('error', handleConnectionError);
await keyv.set('foo', 'bar');
console.log(await keyv.get('foo')); // 'bar'
```

If you want to specify the `KeyvValkey` class directly, you can do so:

```js
import Keyv from 'keyv';
import KeyvValkey from '@keyv/valkey';

const keyv = new Keyv(new KeyvValkey('redis://user:pass@localhost:6379', { disable_resubscribing: true }));
```

Or you can manually create a storage adapter instance and pass it to Keyv:

```js
import Keyv from 'keyv';
import KeyvValkey from '@keyv/valkey';

const KeyvValkey = new KeyvValkey('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: KeyvValkey });
```

Or reuse a previous Redis instance:

```js
import Keyv from 'keyv';
import Redis from 'iovalkey';
import KeyvValkey from '@keyv/valkey';

const redis = new Redis('redis://user:pass@localhost:6379');
const KeyvValkey = new KeyvValkey(redis);
const keyv = new Keyv({ store: KeyvValkey });
```

Or reuse a previous Redis cluster:

```js
import Keyv from 'keyv';
import Redis from 'iovalkey';
import KeyvValkey from '@keyv/valkey';

const redis = new Redis.Cluster('redis://user:pass@localhost:6379');
const KeyvValkey = new KeyvValkey(redis);
const keyv = new Keyv({ store: KeyvValkey });
```
# Options

## useRedisSets

The `useRedisSets` option lets you decide whether to use Redis sets for key management. By default, this option is set to `true`.

When `useRedisSets` is enabled (`true`):

- A namespace for the Redis sets is created, and all created keys are added to this. This allows for group management of keys.
- When a key is deleted, it's removed not only from the main storage but also from the Redis set.
- When clearing all keys (using the `clear` function), all keys in the Redis set are looked up for deletion. The set itself is also deleted.

**Note**: In high-performance scenarios, enabling `useRedisSets` might lead to memory leaks. If you're running a high-performance application or service, it is recommended to set `useRedisSets` to `false`.

If you decide to set `useRedisSets` as `false`, keys will be handled individually and Redis sets won't be utilized.

However, please note that setting `useRedisSets` to `false` could lead to performance issues in production when using the `clear` function, as it will need to iterate over all keys to delete them.

## Example

Here's how you can use the `useRedisSets` option:

```js
import Keyv from 'keyv';

const keyv = new Keyv(new KeyvValkey('redis://user:pass@localhost:6379', { useRedisSets: false }));
```

## License

[MIT © Jared Wray](LISCENCE)
