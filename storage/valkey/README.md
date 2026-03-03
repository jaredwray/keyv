# @keyv/valkey [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Valkey storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey.svg)](https://www.npmjs.com/package/@keyv/valkey)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey)](https://npmjs.com/package/@keyv/valkey)

[Valkey](https://valkey.io) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

Valkey is the open source replacement to Redis which decided to do a [dual license](https://redis.com/blog/redis-adopts-dual-source-available-licensing/) approach moving forward. Valkey is a drop-in replacement for Redis and is fully compatible with the Redis protocol.

We are using the [iovalkey](https://www.npmjs.com/package/iovalkey) which is a Node.js client for Valkey based on the `ioredis` client.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Migrating to v6](#migrating-to-v6)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [namespace](#namespace)
  - [useSets](#usesets)
  - [useRedisSets (deprecated)](#useredisSets-deprecated)
  - [redis](#redis)
- [Methods](#methods)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, ttl?)](#setkey-value-ttl)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.clear()](#clear)
  - [.iterator(namespace?)](#iteratornamespace)
  - [.disconnect()](#disconnect)
- [Clustering](#clustering)
- [License](#license)

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
## Migrating to v6

### Breaking changes

#### Properties instead of opts

In v5, configuration was accessed through the `opts` object:

```js
// v5
store.opts.useRedisSets; // true
```

In v6, all configuration options are exposed as top-level properties with getters and setters:

```js
// v6
store.useSets; // true
store.useSets = false;
```

The `opts` getter still exists for backward compatibility but should not be used for new code.

#### `useRedisSets` renamed to `useSets`

The `useRedisSets` option has been renamed to `useSets`. The `useRedisSets` property is still available as a deprecated getter/setter on the class but will be removed in a future version.

#### `useSets` default changed from `true` to `false`

The default value of `useSets` has changed from `true` to `false` for performance reasons. When enabled, a set is maintained for each namespace to track keys, which can lead to memory leaks in high-throughput scenarios. If you depend on the previous behavior, explicitly set `useSets: true` in your options:

```js
const store = new KeyvValkey('redis://localhost:6379', { useSets: true });
```

## Constructor Options

`KeyvValkey` accepts a connection URI string, an options object, or an existing iovalkey `Redis`/`Cluster` instance. The options object accepts the following properties along with any [`RedisOptions`](https://github.com/valkey-io/iovalkey#connect-to-valkey) from the `iovalkey` library:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `undefined` | Valkey connection URI |
| `useSets` | `boolean` | `false` | Whether to use sets for namespace key management |

## Properties

All configuration options are exposed as properties with getters and setters on the `KeyvValkey` instance. You can read or update them after construction.

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvValkey('redis://localhost:6379');
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

### useSets

Get or set whether to use sets for key management. When `true`, a set is maintained for each namespace to track keys. When `false`, keys are prefixed with the namespace and pattern matching is used instead.

- Type: `boolean`
- Default: `false`

```js
const store = new KeyvValkey('redis://localhost:6379', { useSets: true });
console.log(store.useSets); // true
```

**Note**: When `useSets` is `true`, a set is maintained for each namespace which can lead to memory leaks in high-performance scenarios. This is why the default is `false`.

When `useSets` is `false`, the `clear()` function uses pattern matching (`KEYS` command) to find and delete keys, which may be slower on very large databases.

### useRedisSets (deprecated)

Deprecated alias for `useSets`. Use `useSets` instead.

### redis

Get or set the underlying iovalkey `Redis` or `Cluster` instance.

- Type: `Redis | Cluster`

```js
import Redis from 'iovalkey';

const store = new KeyvValkey('redis://localhost:6379');
console.log(store.redis); // Redis instance

// Replace with a new instance
store.redis = new Redis('redis://localhost:6380');
```

## Methods

### .get(key)

Returns the value for the given key. Returns `undefined` if the key does not exist.

```js
const value = await store.get('foo');
```

### .getMany(keys)

Returns an array of values for the given keys. Returns `undefined` for any key that does not exist.

```js
const values = await store.getMany(['foo', 'bar']);
```

### .set(key, value, ttl?)

Sets a value for the given key with an optional TTL in milliseconds.

```js
await store.set('foo', 'bar');
await store.set('foo', 'bar', 5000); // expires in 5 seconds
```

### .setMany(entries)

Sets multiple key-value pairs in a single batch operation. Each entry can have an optional TTL in milliseconds. Entries with `undefined` values are skipped.

```js
await store.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux', ttl: 5000 },
]);
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise.

```js
const deleted = await store.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store in a single batch operation. Returns `true` if at least one key was deleted, `false` otherwise.

```js
const deleted = await store.deleteMany(['foo', 'bar']);
```

### .has(key)

Returns `true` if the key exists in the store, `false` otherwise.

```js
const exists = await store.has('foo');
```

### .hasMany(keys)

Checks if multiple keys exist in the store in a single batch operation. Returns an array of booleans.

```js
const results = await store.hasMany(['foo', 'bar', 'baz']);
// [true, true, false]
```

### .clear()

Clears all entries from the store. If a namespace is set, only entries within that namespace are cleared.

```js
await store.clear();
```

### .iterator(namespace?)

Returns an async iterator for iterating over all key-value pairs in the store.

```js
for await (const [key, value] of store.iterator('my-namespace')) {
  console.log(key, value);
}
```

### .disconnect()

Disconnects from the Valkey server.

```js
await store.disconnect();
```

## Clustering

The adapter supports Valkey and Redis clusters via iovalkey's `Cluster` class. Pass a `Redis.Cluster` instance directly to the constructor:

```js
import KeyvValkey from '@keyv/valkey';
import Redis from 'iovalkey';

const cluster = new Redis.Cluster([
  { host: '127.0.0.1', port: 7001 },
  { host: '127.0.0.1', port: 7002 },
  { host: '127.0.0.1', port: 7003 },
]);
const store = new KeyvValkey(cluster);
```

Batch methods (`getMany`, `setMany`, `deleteMany`, `hasMany`) automatically group keys by hash slot and run separate transactions per slot group. This avoids `CROSSSLOT` errors without any extra configuration.

Single-key methods (`get`, `set`, `delete`, `has`) work automatically in cluster mode — iovalkey routes each command to the correct node.

### Cluster gotchas

- **`clear()` with `useSets: false` (the default)** uses the `KEYS` command, which only scans the node that receives the command. In cluster mode this may miss keys on other nodes. Set `useSets: true` if you need reliable `clear()` across all cluster nodes.
- **`iterator()` in cluster mode** uses `SCAN`, which only iterates keys on the node the command is routed to. It may not return all keys across the cluster.

## License

[MIT © Jared Wray](LISCENCE)
