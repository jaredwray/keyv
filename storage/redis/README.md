# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Redis storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)
[![npm](https://img.shields.io/npm/dm/@keyv/redis)](https://npmjs.com/package/@keyv/redis)

Redis storage adapter for [Keyv](https://github.com/jaredwray/keyv).

# Features
* Built on top of [@redis/client](https://npmjs.com/package/@redis/client).
* TTL is handled directly by Redis via absolute `PXAT` expiry, with an automatic relative `PX` fallback for servers older than 6.2 (see [Expiration and TTL](#expiration-and-ttl)).
* Supports Redis Clusters.
* Url connection string support or pass in your Redis Options
* Easily add in your own Redis client.
* Namespace support for key management.
* Unlink as default delete method for performance.
* Access to the Redis client for advanced use cases.
* Keyv and Redis Libraries are exported for advanced use cases.
* `createKeyv` function for easy creation of Keyv instances.
* jsDoc comments for easy documentation.
* CJS / ESM and TypeScript supported out of the box.

# Table of Contents
* [Usage](#usage)
* [Migrating from v5 to v6](#migrating-from-v5-to-v6)
* [Migrating from v4 to v5](#migrating-from-v4-to-v5)
* [Using the createKeyv function](#using-the-createkeyv-function)
* [Using the createKeyvNonBlocking function](#using-the-createkeyvnonblocking-function)
* [Namespaces](#namespaces)
* [Fixing Double Prefixing of Keys](#fixing-double-prefixing-of-keys)
* [Using Generic Types](#using-generic-types)
* [Performance Considerations](#performance-considerations)
* [Expiration and TTL](#expiration-and-ttl)
* [High Memory Usage on Redis Server](#high-memory-usage-on-redis-server)
* [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts)
* [Using Cacheable with Redis](#using-cacheable-with-redis)
* [Clustering](#clustering)
* [Sentinel](#sentinel)
* [TLS Support](#tls-support)
* [Redis Cloud](#redis-cloud)
* [Amazon ElastiCache](#amazon-elasticache)
* [Upstash](#upstash)
* [Keyv Redis Options](#keyv-redis-options)
* [API](#api)
* [Events](#events)
* [Migrating from v3 to v4](#migrating-from-v3-to-v4)
* [About Redis Sets and its Support in v4](#about-redis-sets-and-its-support-in-v4)
* [Using with NestJS](#using-with-nestjs)
* [License](#license)

# Installation

```bash
npm install --save keyv @keyv/redis
```

# Usage

Here is a standard use case where we implement `Keyv` and `@keyv/redis`:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
keyv.on('error', handleConnectionError);
```

Here is the same example but with the `Keyv` instance created with the `createKeyv` function:

```js
import { createKeyv } from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379');
```

You only have to import the `@keyv/redis` library if you are using the `createKeyv` function. 🎉 Otherwise, you can import `Keyv` and `@keyv/redis` independently.

Here you can pass in the Redis options directly:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const uri = "redis://localhost:6379";

// NOTE: please use the settings that you need to configure. Check out Keyv Redis Options section
const options = {
  namespace: "test",
  namespaceSeparator: "->",
  clearBatchSize: 100,
  useUnlink: true,
  noNamespaceAffectsAll: true,
};

const keyvRedis = new KeyvRedis(uri, options);

const keyv = new Keyv(keyvRedis);
```

Or you can create a new Redis instance and pass it in with `KeyvOptions` such as setting the `store`:

```js
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';

const redis = createClient({ url: 'redis://user:pass@localhost:6379' });
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis});
```

# Migrating from v5 to v6

`@keyv/redis` v6 tracks Keyv's shared version. The adapter already implemented the v6 storage contract (`capabilities.expires`); these are the redis-specific things to know:

* **`@redis/client` is now v6.** `createClient`, `createCluster`, and `createSentinel` are still exported from this package. `createClient` takes a `RedisClientOptions` object (`{ url: 'redis://...' }`), not a URI string.
* **Adapters receive absolute `expires`, not relative `ttl`.** When you call `keyv.set(key, value, 1000)`, Keyv converts that millisecond ttl to a Unix-ms deadline and passes it to the adapter. Direct adapter calls should pass `expires` (`Date.now() + ttl`), not a relative ttl.
* **Keyv no longer prefixes keys.** Namespacing lives on the adapter (`namespace` + `namespaceSeparator`, default `::`). You do not need `useKeyPrefix: false` — that option was removed from Keyv.
* **`keyPrefixSeparator` is now `namespaceSeparator`.** The option, getter, and setter were renamed to match the other adapters. In plain JavaScript the old option is ignored and the store uses `::`, so rename it wherever you set it.
* **Keys written by v5 need matching settings.** v5's default setup, `new Keyv(new KeyvRedis(uri))`, applied its default `keyv` namespace twice, once in Keyv and once in the adapter, so `foo` was stored as `keyv::keyv:foo`. Read those keys with `new Keyv(new KeyvRedis(uri, { namespaceSeparator: '::keyv:' }), { namespace: 'keyv' })`. The [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#the-default-keyv-namespace-was-removed) lists the settings for other v5 setups.
* **`createKeyv` accepts cluster and sentinel options** the same way the `KeyvRedis` constructor does.
* **A failure is reported once.** When the adapter rejects because of `throwOnConnectError` or `throwOnErrors`, it no longer also emits `error`. A failed connection rejects with the connection error as the rejection's `cause`. See [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts).

# Migrating from v4 to v5

The major change from v4 to v5 is that we are now using v5 of the `@redis/client` library which has a new API. This means that some methods have changed but it should be a drop-in replacement for most use cases.

# Keyv Redis Options

You can pass in options to the `KeyvRedis` constructor. Here are the available options:

```typescript
export type KeyvRedisOptions = {
	/**
	 * Namespace for the current instance.
	 */
	namespace?: string;
	/**
	 * Separator to use between namespace and key.
	 */
	namespaceSeparator?: string;
	/**
	 * Number of keys to delete in a single batch.
	 */
	clearBatchSize?: number;
	/**
	 * Enable Unlink instead of using Del for clearing keys. This is more performant but may not be supported by all Redis versions.
	 */
	useUnlink?: boolean;

	/**
	 * Whether to allow clearing all keys when no namespace is set.
	 * If set to true and no namespace is set, iterate() will return all keys.
	 * @default false
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * Throw an error if the client is not connected when trying to connect. By default this is
	 * `true` so a failed Redis connection throws.
	 * @default true
	 */
	throwOnConnectError?: boolean;

	/**
	 * Throw an error if any operation fails. When `false`, failures emit an `error` event
	 * and return no-op responses (`undefined` for gets, `false` for writes/deletes).
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the full connect handshake (TCP plus Redis HELLO / AUTH).
	 * When undefined, the Redis client default is used. If set, a connection that does not
	 * succeed within this time throws, the in-flight attempt is aborted, and leftover sockets
	 * are not left open. Aborting destroys the client, which rejects the commands it had
	 * queued: a client you passed in connects again on the next operation, and a client Keyv
	 * constructed is replaced. When Keyv constructs the client, this is also passed as
	 * `socket.connectTimeout` unless that option is already set. Auto-reconnect is disabled
	 * unless you pass `socket.reconnectStrategy`. A TCP connect that is still pending can't be
	 * aborted, so on a client you pass in, set `socket.connectTimeout` no higher than this.
	 * @default undefined
	 */
	connectionTimeout?: number;
};
```
You can pass these options when creating a new `KeyvRedis` instance:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyvRedis = new KeyvRedis('redis://user:pass@localhost:6379', {
  namespace: 'my-namespace',
  namespaceSeparator: ':',
  clearBatchSize: 1000,
  useUnlink: true,
  noNamespaceAffectsAll: false,
  connectionTimeout: 200
});

const keyv = new Keyv({ store: keyvRedis });
```

You can also set these options after the fact by using the `KeyvRedis` instance properties:

```js
import {createKeyv} from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379');
keyv.store.namespace = 'my-namespace';
```

See [API](#api) for the full property and method list. Missing keys and swallowed errors return `undefined` (never `null`). Events are emitted through [Hookified](https://hookified.org) — see [Events](#events).

# Using the `createKeyv` function

The `createKeyv` function is a convenience function that creates a new `Keyv` instance with the `@keyv/redis` store. It applies `namespace` on both Keyv and the adapter so keys are prefixed once. Here is an example of how to use it:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379');
```

To use a namespace you can do it here and this will set Keyv up correctly to avoid the double namespace issue:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379', {namespace: 'my-namespace'});
```

# Using the `createKeyvNonBlocking` function

The `createKeyvNonBlocking` function is a convenience function that creates a new `Keyv` instance with the `@keyv/redis` store. It does what `createKeyv` does but also turns off the adapter's `throwOnConnectError` and `throwOnErrors`, the Redis offline queue, and the reconnect strategy, so that when used as a secondary cache in libraries such as [cacheable](https://npmjs.org/package/cacheable) it does not block the primary cache. This is useful when you want to use Redis as a secondary cache and do not want to block the primary cache on connection errors or timeouts when using `nonBlocking`. Concurrent operations share the in-flight Redis connect so they are not dropped while the client is still opening. Here is an example of how to use it:

```js
import { createKeyvNonBlocking } from '@keyv/redis';
const keyv = createKeyvNonBlocking('redis://user:pass@localhost:6379');
keyv.on('error', (error) => console.error('Redis error', error));
```

As with any Keyv instance, attach an `error` listener so a failed operation returns a fallback value instead of rejecting. See [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts).

With a URI or client options, `createKeyvNonBlocking` creates the client with the offline queue and reconnect already off. When Redis is down, an operation fails as soon as its connection attempt does and returns its fallback value, instead of waiting for Redis to come back. A refused connection fails immediately. A host that doesn't respond waits for the socket's `connectTimeout` (5 seconds by default), which the `connectionTimeout` option can shorten.

node-redis fixes a client's reconnect strategy when the client is created, so a client you pass in keeps its own. Create it with `socket: { reconnectStrategy: false }` to get the same behavior. Its offline queue is still turned off:

```js
import { createClient, createKeyvNonBlocking } from '@keyv/redis';
const client = createClient({ url: 'redis://localhost:6379', socket: { reconnectStrategy: false } });
const keyv = createKeyvNonBlocking(client);
```

Cluster and sentinel connections keep their own offline queue and reconnect settings. Only the throw settings change.

# Namespaces

By default namespacing is turned off, this is done because it causes much more memory / performance usage for Redis.

Redis does **not** treat colons (`:`) or namespaces as special—there are no hierarchical keys or namespace mechanics internally. The dramatic memory savings you see when removing prefixes like `namespace:` come from one thing: **key length**. Redis stores every key as a full string in memory, wrapped in an SDS structure and allocated by jemalloc. Longer keys (e.g., `namespace:key123`) fall into larger jemalloc size classes, require more bytes for the SDS header, and cause more fragmentation. Shorter keys (e.g., `key123`) fit into much smaller slabs, pack tightly, and result in far more stable and predictable memory usage.

This means the colon is not the issue—**the extra characters are.** A key that goes from ~18 bytes to ~6 bytes can use *half the memory per key* once overhead, allocator classes, and fragmentation are considered. Multiply that by hundreds of thousands or millions of keys, and memory usage becomes significantly smaller and much more stable simply because the keys are shorter.

## How to use Namespaces

You can set a namespace for your keys. This is useful if you want to manage your keys in a more organized way. Here is an example of how to set a `namespace` with the `store` option:

```js
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';

const redis = createClient({ url: 'redis://user:pass@localhost:6379' });
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis, namespace: 'my-namespace' });
```

To make this easier, you can use the `createKeyv` function which will automatically set the `namespace` option to the `KeyvRedis` instance:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379', { namespace: 'my-namespace' });
```

This will prefix all keys with `my-namespace::` (the default `namespaceSeparator` is `::`). You can also set the namespace after the fact:

```js
keyv.namespace = 'my-namespace';
```

`clear()` and `iterator()` only touch keys that start with the namespace and separator (`my-namespace::`). Both are matched literally, so `*`, `?`, `[`, `]` and `\` in them have no special meaning to `SCAN`: clearing `tenant*` leaves `tenant-prod` alone. Clearing `my-namespace` does also clear a namespace that extends it with the separator, such as `my-namespace::archive`, because a key can contain the separator too. Keep the separator out of namespace names if you need them kept apart.

NOTE: If you plan to do many clears or deletes, it is recommended to read the [Performance Considerations](#performance-considerations) section.

# Fixing Double Prefixing of Keys

In v6, Keyv does not prefix keys. The Redis adapter owns namespacing, so this:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'), { namespace: 'my-namespace' });
```

stores keys as `my-namespace::key`. `createKeyv` does the same wiring for you:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379', { namespace: 'my-namespace' });
```

If you are upgrading from v5, drop `useKeyPrefix` — it no longer exists. Do not also set Redis client's `keyPrefix`; use the adapter `namespace` instead so `SCAN`/`clear`/`iterator` stay in sync.

## Using Generic Types

When initializing `KeyvRedis`, you can specify the type of the values you are storing and you can also specify types when calling methods:

```typescript
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';


type User = {
  id: number
  name: string
}

const redis = createClient({ url: 'redis://user:pass@localhost:6379' });

const keyvRedis = new KeyvRedis<User>(redis);
const keyv = new Keyv({ store: keyvRedis });

await keyv.set("user:1", { id: 1, name: "Alice" })
const user = await keyv.get("user:1")
console.log(user.name) // 'Alice'

// specify types when calling methods
const user = await keyv.get<User>("user:1")
console.log(user.name) // 'Alice'
```

# Performance Considerations

With namespaces being prefix based it is critical to understand some of the performance considerations we have made:
* `clear()` - We use the `SCAN` command to iterate over keys. This is a non-blocking command that is more efficient than `KEYS`. In addition we are using `UNLINK` by default instead of `DEL`. Even with that if you are iterating over a large dataset it can still be slow. It is highly recommended to use the `namespace` option to limit the keys that are being cleared and if possible to not use the `clear()` method in high performance environments. If you don't set namespaces, you can enable `noNamespaceAffectsAll` to clear all keys using the `FLUSHDB` command which is faster and can be used in production environments.

* `delete()` - By default we are now using `UNLINK` instead of `DEL` for deleting keys. This is a non-blocking command that is more efficient than `DEL`. If you are deleting a large number of keys it is recommended to use the `deleteMany()` method instead of `delete()`.

* `clearBatchSize` - The `clearBatchSize` option is set to `1000` by default. This is because Redis has a limit of 1000 keys that can be deleted in a single batch. If no namespace is defined and noNamespaceAffectsAll is set to `true` this option will be ignored and the `FLUSHDB` command will be used instead.

* `useUnlink` - This option is set to `true` by default. This is because `UNLINK` is a non-blocking command that is more efficient than `DEL`. If you are not using `UNLINK` and are doing a lot of deletes it is recommended to set this option to `true`.

* `setMany`, `getMany`, `deleteMany` - These methods are more efficient than their singular counterparts. These will be used by default in the `Keyv` library such as when using `keyv.delete(string[])` it will use `deleteMany()`.

If you want to see even better performance please see the [Using Cacheable with Redis](#using-cacheable-with-redis) section as it has non-blocking and in-memory primary caching that goes along well with this library and Keyv.

# Expiration and TTL

Keyv hands this adapter an **absolute** expiry — a Unix timestamp in milliseconds — computed once on the Keyv host. The adapter writes it to Redis with `SET ... PXAT`, the absolute-expiry option. Because the deadline is absolute, it is immune to clock skew and to any latency between Keyv computing the expiry and Redis receiving the command: a key set to expire at `T` expires at `T` no matter how long the write takes to arrive.

`PXAT` was added in **Redis 6.2**. For older servers the adapter automatically falls back to the relative `PX` option (the remaining lifetime in milliseconds):

* On the **first** expiring write, the adapter runs `INFO server` once, parses `redis_version`, and caches whether the server is 6.2+. Every later write reuses that cached answer, so detection costs one `INFO` round-trip per connection, not per write.
* **6.2 or newer** → the write uses `PXAT: expires` (absolute).
* **Older than 6.2** → the write uses `PX: max(1, expires - Date.now())` (relative, computed at write time). An expiry already in the past becomes `PX: 1` because Redis rejects `SET ... PX 0`.
* If the version **cannot be determined** — for example a cluster where `INFO` isn't directly available, or a transient error reading it — the adapter assumes `PXAT` is supported, since such deployments are overwhelmingly modern. The cached result means it won't keep retrying `INFO` on every write.

The same detection and fallback apply to `setMany`, including the per-hash-slot grouping used in cluster mode. No configuration is required; you always call `keyv.set(key, value, ttl)` with a relative millisecond `ttl` (or rely on the `ttl` option) and the adapter chooses the correct Redis option for your server.

The relative `PX` fallback re-derives the remaining lifetime store-side, so on pre-6.2 servers a large write-to-Redis latency could in theory shorten the effective TTL by that latency. On 6.2+ (`PXAT`) there is no such window. If you need the skew-immune absolute behaviour, run Redis 6.2 or later.

# High Memory Usage on Redis Server

This is because we are using `UNLINK` by default instead of `DEL`. This is a non-blocking command that is more efficient than `DEL` but will slowly remove the memory allocation. 

If you are deleting or clearing a large number of keys you can disable this by setting the `useUnlink` option to `false`. This will use `DEL` instead of `UNLINK` and should reduce the memory usage.

```js
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { useUnlink: false }));
// Or
keyv.store.useUnlink = false;
```

# Gracefully Handling Errors and Timeouts

Attach an `error` listener to the Keyv instance when you use `@keyv/redis`. Keyv handles errors the way a Node.js `EventEmitter` does: when an operation fails, it emits `error`, and then

- **with a listener attached**, the operation returns a fallback value, such as `undefined` from `get` or `false` from `set`;
- **with no listener attached**, the operation rejects with the error.

The Redis client also reports connection problems as `error` events outside any Keyv call, for example when a connection drops. Keyv forwards these to its own `error` event. With no listener attached, such an error is thrown with no call to catch it, which can crash your process.

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
keyv.on('error', (error) => {
  console.error('error', error);
});
```

See [Error Handling](https://github.com/jaredwray/keyv/tree/main/core/keyv#error-handling) in the Keyv README for the fallback value each method returns.

The adapter has its own options that decide whether `KeyvRedis` rejects or reports a failure as an `error` event:

- `throwOnConnectError` (default `true`): reject when the connection fails, with the connection error as the rejection's `cause`. When it is `false`, the adapter emits the connection error as an `error` event instead.
- `throwOnErrors` (default `false`): reject when an operation fails. When it is `false`, the adapter emits `error` and returns a no-op value on `get`, `getMany`, `set`, `setMany`, `delete`, and `deleteMany` if the connection is lost.

The adapter reports each failure once: when it rejects, it does not also emit `error`. Used through Keyv, a rejection from the adapter is handled by the rule above: Keyv emits `error`, then returns a fallback value if a listener is attached or rejects if none is.

There is a default `Reconnect Strategy` if you pass in just a `uri` connection string we will automatically create a Redis client for you with the following reconnect strategy:

```typescript
export const defaultReconnectStrategy = (attempts: number): number | Error => {
	// Exponential backoff base: double each time, capped at 2s.
	// Parentheses make it clear we do (2 ** attempts) first, then * 100
	const backoff = Math.min((2 ** attempts) * 100, 2000);

	// Add random jitter of up to ±50ms to avoid thundering herds:
	const jitter = (Math.random() - 0.5) * 100;

	return backoff + jitter;
};
```

# Using Cacheable with Redis

If you are wanting to see even better performance with Redis, you can use [Cacheable](https://npmjs.org/package/cacheable) which is a multi-layered cache library that has in-memory primary caching and non-blocking secondary caching. Here is an example of how to use it with Redis:

```js
import KeyvRedis from '@keyv/redis';
import Cacheable from 'cacheable';

const secondary = new KeyvRedis('redis://user:pass@localhost:6379');

const cache = new Cacheable( { secondary } );
```

For even higher performance you can set the `nonBlocking` option to `true`:

```js
const cache = new Cacheable( { secondary, nonBlocking: true } );
```

This will make it so that the secondary does not block the primary cache and will be very fast. 🚀

> **Note:** `cacheable` 2 depends on Keyv v5 and wraps a store like this one in its own v5 `Keyv`. A v5 `Keyv` passes a relative `ttl` where a v6 adapter expects an absolute `expires`, so entries expire at the wrong time, usually at once. Check which Keyv version your `cacheable` needs with `npm view cacheable dependencies.keyv`, and keep this setup on v5 until it supports v6. See [Libraries That Embed Keyv v5](https://keyv.org/docs/migration/v5-to-v6/#libraries-that-embed-keyv-v5).

# Clustering

If you are using a Redis Cluster, you can pass in the `redisOptions` directly. Here is an example of how to do that:

```js
import Keyv from 'keyv';
import KeyvRedis, { createCluster } from '@keyv/redis';

const cluster = createCluster({
    rootNodes: [
      {
        url: 'redis://127.0.0.1:7000',
      },
      {
        url: 'redis://127.0.0.1:7001',
      },
      {
        url: 'redis://127.0.0.1:7002',
      },
    ],
});

const keyv = new Keyv({ store: new KeyvRedis(cluster) });
```

You can learn more about the `createCluster` function in the [documentation](https://github.com/redis/node-redis/blob/master/docs/clustering.md) at https://github.com/redis/node-redis/tree/master/docs.

# Sentinel

If you are using Sentinel to provide high availability for your Redis instances, you can pass in the sentinel options directly to the `KeyvRedis` constructor:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv({
  store: new KeyvRedis({
    name: 'mymaster',
    sentinelRootNodes: [
      { host: '127.0.0.1', port: 26379 },
      { host: '127.0.0.1', port: 26380 },
      { host: '127.0.0.1', port: 26381 },
    ],
  }),
});
```

For TypeScript users, the `RedisSentinelOptions` type is exported from the package:

```typescript
import KeyvRedis, { type RedisSentinelOptions } from '@keyv/redis';

const sentinelOptions: RedisSentinelOptions = {
  name: 'mymaster',
  sentinelRootNodes: [
    { host: '127.0.0.1', port: 26379 },
    { host: '127.0.0.1', port: 26380 },
    { host: '127.0.0.1', port: 26381 },
  ],
};

const keyvRedis = new KeyvRedis(sentinelOptions);
```

You can learn more about Sentinel configuration in the [documentation](https://github.com/redis/node-redis/blob/master/docs/sentinel.md) at https://github.com/redis/node-redis/tree/master/docs.

# TLS Support

Here is an example of how to use TLS using the `redisOptions`:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const tlsOptions = {
    socket: {
      host: 'localhost',
      port: 6379,
      tls: true,  // Enable TLS connection
      rejectUnauthorized: false,  // Ignore self-signed certificate errors (for testing)
      
      // Alternatively, provide CA, key, and cert for mutual authentication
      ca: fs.readFileSync('/path/to/ca-cert.pem'),
      cert: fs.readFileSync('/path/to/client-cert.pem'),  // Optional for client auth
      key: fs.readFileSync('/path/to/client-key.pem'),    // Optional for client auth
    }
};

const keyv = new Keyv({ store: new KeyvRedis(tlsOptions) });
```

# Redis Cloud

You connect to Redis Cloud the same way you connect to any Redis server, with a URI or with Redis client options. `KeyvRedis` creates a client from a URI string. It passes an options object, unchanged except for `connectionTimeout` when you set it, to `createClient` from `@redis/client`. That means `url`, `username`, `password`, and every `socket` TLS option work exactly as documented for `@redis/client`. `createKeyv` accepts the same arguments.

## Endpoint and credentials

The database endpoint (host and port) is on the database's **Configuration** tab in the Redis Cloud console: in the **Access** section for Essentials databases, or the **General** section for Pro databases. By default the database has a user named `default`. To see its password, use **Default user** > **Configure** for an Essentials database, or the **Security** section of the **Configuration** tab for a Pro database. If you turned on role-based access control and turned off the default user, use the username and password of a data access role instead.

With TLS turned on, the URI uses the `rediss://` scheme (two `s`'s). Without `redis_ca.pem`, the URI below fails to connect when the database's certificate was issued by a Redis Cloud CA, so trust that CA as shown in [Trusting `redis_ca.pem`](#trusting-redis_capem).

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const url = new URL(`rediss://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
url.username = process.env.REDIS_USERNAME;
url.password = process.env.REDIS_PASSWORD;

const keyv = new Keyv(new KeyvRedis(url.toString()));
keyv.on('error', (error) => console.error('Redis error', error));
```

Set `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_HOST`, and `REDIS_PORT` from the console. The username is `default` unless you use a data access role. Setting `url.password` percent-encodes reserved URI characters such as `@`, `:`, `/`, and `#`, so pass the password as stored. A `redis://` URI connects without TLS, which a TLS-enabled database refuses.

## Turning on TLS

TLS is off by default. Turn it on from the **Security** section of the database's **Configuration** tab. It is available on paid Essentials and Pro plans, but not on the Free plan. Redis Cloud recommends TLS for any database reached over its public endpoint. Once TLS is on, every connection must use it.

## Trusting `redis_ca.pem`

Download the Redis Cloud CA bundle, `redis_ca.pem`, with **Download server certificate** on the database's **Configuration** tab, or from **Account Settings** > **Security**. The file holds several certificates, including Redis Cloud's own root CAs, which Node.js does not trust by default. Without the bundle, a `rediss://` URI checks the certificate only against Node.js's built-in CAs, which fails for databases whose certificates were issued by a Redis Cloud CA. Pass the whole file as `socket.ca`. Node.js loads every certificate in it.

```js
import fs from 'node:fs';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const url = new URL(`rediss://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
url.username = process.env.REDIS_USERNAME;
url.password = process.env.REDIS_PASSWORD;

const keyv = new Keyv(new KeyvRedis({
  url: url.toString(),
  socket: {
    tls: true,
    ca: fs.readFileSync('/path/to/redis_ca.pem'),
  },
}));
keyv.on('error', (error) => console.error('Redis error', error));
```

You can set the host, port, and credentials as separate options instead of a `url`. `password` here is the raw password, not percent-encoded, because it is not part of a URI:

```js
const keyv = new Keyv(new KeyvRedis({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    tls: true,
    ca: fs.readFileSync('/path/to/redis_ca.pem'),
  },
}));
```

Keep these points in mind:

- Leave `rejectUnauthorized` unset so Node.js verifies the certificate. The [TLS Support](#tls-support) sample sets it to `false`, which is only suitable for a local server with a self-signed certificate.
- Connect with the endpoint hostname from the console, not an IP address. The certificate check compares hostnames.
- `socket.tls` must match the URI scheme, so it must be `true` with `rediss://`. Otherwise `@redis/client` throws.
- A URI string gets the adapter's [`defaultReconnectStrategy`](#helpers). With an options object, `@redis/client` uses its own reconnect behavior unless you set `socket.reconnectStrategy`, for example to `defaultReconnectStrategy`, which you can import from `@keyv/redis`.

## Mutual TLS

If the database requires client authentication (**Mutual TLS** in the TLS settings), add the client certificate and private key you registered there to the same `socket` options:

```js
const keyv = new Keyv(new KeyvRedis({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    tls: true,
    ca: fs.readFileSync('/path/to/redis_ca.pem'),
    cert: fs.readFileSync('/path/to/client.crt'),
    key: fs.readFileSync('/path/to/client.key'),
  },
}));
```

Other hosted Redis services that give you a single, non-cluster endpoint follow the same pattern: a `rediss://` URI or `socket.tls: true`, plus the provider's CA certificate if Node.js doesn't already trust it. Services that run in cluster mode need cluster options instead, even when they show a single endpoint. Amazon ElastiCache Serverless is one of them; see [Amazon ElastiCache](#amazon-elasticache).

# Amazon ElastiCache

`@keyv/redis` connects to Amazon ElastiCache for Valkey and ElastiCache for Redis OSS, on node-based clusters and on Serverless caches. Valkey speaks the Redis protocol, so this adapter works with either engine. `KeyvRedis` passes an options object to `createCluster` from `@redis/client` when it has `rootNodes`, and to `createClient` otherwise, unchanged except for `connectionTimeout` when you set it. So `username`, `password`, `socket`, `defaults`, and `pingInterval` below are standard `@redis/client` options. `createKeyv` accepts the same arguments.

## Node-based or Serverless: which endpoint

The endpoints are on the cache's page in the ElastiCache console. Which one you use, and how you connect, depends on how the cache was created:

| Deployment | Endpoint | Connect with |
| --- | --- | --- |
| Node-based, cluster mode disabled | **Primary endpoint** | Client options or a URI |
| Node-based, cluster mode enabled | **Configuration endpoint** | Cluster options (`rootNodes`) |
| Serverless | **Endpoint** | Cluster options (`rootNodes`) |

- **Cluster mode disabled.** The primary endpoint always points to the current primary node, including after a failover, so use it for Keyv, which writes as well as reads. The reader endpoint only reaches read replicas, which reject writes, and a node endpoint stays with one node when its role changes. A cluster with a single node has no primary endpoint, so use the node's endpoint.
- **Cluster mode enabled.** The client sends `CLUSTER SLOTS` to the configuration endpoint to learn which shard owns which hash slots, then connects to each shard's primary.
- **Serverless.** A Serverless cache always runs in cluster mode and only supports cluster-mode clients. Its endpoint reports a single node that owns every hash slot, so `createCluster` opens one connection, but the cache still enforces cluster rules: a command or transaction whose keys are in different hash slots fails with `CROSSSLOT`. `KeyvRedis` splits `getMany`, `setMany`, `hasMany`, and `deleteMany` into one command per hash slot only when it is connected through `createCluster`. With a URI or client options, those calls fail with `CROSSSLOT`.

The Serverless endpoint takes connections on port 6379. Port 6380 serves reads from replicas. `@redis/client` only connects to the primaries that `CLUSTER SLOTS` lists unless you set `useReplicas: true`.

## TLS and `rediss://`

Serverless caches always encrypt connections with TLS. On a node-based cluster, TLS is the **Encryption in transit** setting, which both AUTH tokens and RBAC users require. With TLS on, connect with a `rediss://` URI (two `s`'s) or `socket.tls: true`. A plain `redis://` connection to a TLS endpoint fails.

ElastiCache certificates are issued through AWS Certificate Manager and chain to public certificate authorities that Node.js trusts by default. Unlike [Redis Cloud](#trusting-redis_capem), you don't pass a `ca`. Leave `rejectUnauthorized` unset so Node.js checks the certificate, and connect with the endpoint hostname, not an IP address, so the hostname check passes. ElastiCache doesn't support mutual TLS, so there is no client certificate to configure.

## AUTH token or RBAC user

ElastiCache has two ways to require a password:

- **AUTH token** (node-based clusters only). A single password that you set when you choose **Valkey AUTH default user access** or **Redis OSS AUTH default user access** as the cluster's access control. Connect with `password` set to the token and no `username`, which authenticates as the `default` user.
- **Role-based access control (RBAC)** (Valkey 7.2 and later, Redis OSS 6.0 and later, and the only option for Serverless). Create a user in **User management** with password authentication and an access string, add it to a user group in **User group management**, and assign the group to the cache. Connect with the user's **user name** (not its user ID) as `username` and one of its passwords as `password`.

An RBAC user needs to read and write Keyv's keys and run `SCAN`, which `clear()` and `iterator()` use. The access string `on ~* +@all` allows every command on every key. To limit a user to one Keyv namespace, set `namespace` on the Keyv instance or as `KeyvRedis`'s second argument. It is not a client option, so putting it next to `username` or in `defaults` does nothing. With the default separator, the namespace `cache` stores keys as `cache::<key>`, which the pattern in `on ~cache::* +@all` matches. Keep access strings in the ElastiCache configuration. They can't contain passwords, so keep the password itself in an environment variable or AWS Secrets Manager.

Redis OSS adds a user named `default` to every user group. That user can run every command on every key and has no password, so a key pattern on your own user is not the only access to the cache until you replace `default` with a disabled user or one that has a password. A Valkey user group turns this `default` user off.

A node-based cluster without access control, or a Serverless cache without a user group, lets anyone who can reach the endpoint connect as `default` with no password. Only the network rules in [VPC and security groups](#vpc-and-security-groups) protect it. Serverless caches with a public endpoint require IAM authentication, which uses short-lived tokens instead of a password and isn't covered here.

## Node-based cluster with cluster mode disabled

Connect to the primary endpoint with client options:

```ts
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis({
  username: process.env.ELASTICACHE_USERNAME,
  password: process.env.ELASTICACHE_PASSWORD,
  socket: {
    host: process.env.ELASTICACHE_HOST,
    port: Number(process.env.ELASTICACHE_PORT ?? 6379),
    tls: true,
  },
}));
keyv.on('error', (error) => console.error('ElastiCache error', error));

await keyv.set('greeting', 'hello', 60_000);
console.log(await keyv.get('greeting')); // 'hello'
await keyv.disconnect();
```

Set `ELASTICACHE_HOST` to the primary endpoint without the port, such as `master.my-cache.abc123.use1.cache.amazonaws.com`. Set `ELASTICACHE_USERNAME` and `ELASTICACHE_PASSWORD` for an RBAC user, or only `ELASTICACHE_PASSWORD` for an AUTH token.

A URI works too. Setting `url.password` percent-encodes reserved characters such as the `#` an AUTH token may contain, so pass the password as stored:

```ts
const url = new URL(`rediss://${process.env.ELASTICACHE_HOST}:${process.env.ELASTICACHE_PORT ?? 6379}`);
url.username = process.env.ELASTICACHE_USERNAME ?? '';
url.password = process.env.ELASTICACHE_PASSWORD ?? '';

const keyv = new Keyv(new KeyvRedis(url.toString()));
```

## Cluster mode enabled and Serverless

Use cluster options for a node-based cluster with cluster mode enabled and for every Serverless cache. Put the endpoint in `rootNodes`, and the TLS setting and credentials in `defaults`:

```ts
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis({
  rootNodes: [{ url: `rediss://${process.env.ELASTICACHE_HOST}:${process.env.ELASTICACHE_PORT ?? 6379}` }],
  defaults: {
    username: process.env.ELASTICACHE_USERNAME,
    password: process.env.ELASTICACHE_PASSWORD,
    socket: { tls: true },
  },
}));
keyv.on('error', (error) => console.error('ElastiCache error', error));

await keyv.setMany([
  { key: 'user:1', value: 'Ada' },
  { key: 'user:2', value: 'Grace' },
]);
console.log(await keyv.getMany(['user:1', 'user:2'])); // ['Ada', 'Grace']
await keyv.disconnect();
```

Set `ELASTICACHE_HOST` to the configuration endpoint, such as `clustercfg.my-cache.abc123.use1.cache.amazonaws.com`, or the Serverless endpoint, such as `my-cache-abc123.serverless.use1.cache.amazonaws.com`. For a Serverless cache without a user group, leave out `username` and `password`.

- `@redis/client` only uses `rootNodes` to connect to the endpoint and read the slot map. It creates the connections to the shards from `defaults` plus the host and port that `CLUSTER SLOTS` returns, so TLS and credentials only in `rootNodes` aren't used for them. Put them in `defaults`.
- `socket.tls` in `defaults` matches the `rediss://` scheme in `rootNodes`. If they disagree, `@redis/client` throws.
- `@redis/client` connects to each node by the hostname ElastiCache reports, so the certificate hostname check passes without any address mapping.

## Failover and unresponsive nodes

During a failover or node replacement, ElastiCache closes connections, and `@redis/client` reconnects. Commands sent before a connection drops reject, and a Keyv instance with an `error` listener returns its fallback value for them, such as `undefined` from `get`.

A node that stops responding while its TCP connection stays open is harder to notice. `@redis/client` gives each command a timeout (`commandOptions.timeout`, 5 seconds by default), but that timeout only covers the time before the command is written to the socket, for example while the client reconnects. Once the command is written, the command timeout does not limit how long the client waits for a reply.

`socket.socketTimeout` is the idle timeout on the socket. It closes the connection after that many milliseconds with no data sent or received, and commands waiting on it reject with a socket timeout error. A command that has already been written, with nothing else going out, hits this when the node goes quiet. Node.js counts a write as activity, and `pingInterval` writes `PING` on a timer, so each ping refreshes `socketTimeout` even when the node never replies. Leave `pingInterval` unset when you want `socketTimeout` to bound a silent node. It is useful on its own for a server that closes idle clients. ElastiCache's default parameter group leaves idle connections open (`timeout` is `0`).

`socket.reconnectStrategy` decides whether to reconnect after the socket closes. `@redis/client`'s own strategy does not reconnect after a socket timeout, which leaves a cluster's node connection closed until you restart the client. Pass `defaultReconnectStrategy`, which `@keyv/redis` exports and uses for URI strings. It waits and retries after a socket timeout too.

For a cluster or Serverless cache, both settings go in `defaults`:

```ts
import Keyv from 'keyv';
import KeyvRedis, { defaultReconnectStrategy } from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis({
  rootNodes: [{ url: `rediss://${process.env.ELASTICACHE_HOST}:${process.env.ELASTICACHE_PORT ?? 6379}` }],
  defaults: {
    username: process.env.ELASTICACHE_USERNAME,
    password: process.env.ELASTICACHE_PASSWORD,
    socket: {
      tls: true,
      socketTimeout: 3000,
      reconnectStrategy: defaultReconnectStrategy,
    },
  },
}));
keyv.on('error', (error) => console.error('ElastiCache error', error));
```

For a cluster with cluster mode disabled, put `socketTimeout` and `reconnectStrategy` in `socket`. If Keyv is a cache in front of another data source and should never hold up a request, also see [Using the `createKeyvNonBlocking` function](#using-the-createkeyvnonblocking-function) and [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts).

## VPC and security groups

Node-based clusters run in subnets of your VPC, and Serverless caches with the VPC connection type are reached through VPC endpoints in subnets you choose. They have no public address, so your application must run in the same VPC or in a network connected to it, for example through VPC peering, AWS Transit Gateway, or a VPN. An AWS Lambda function must be attached to the VPC. Serverless caches running Valkey 9.0 or later can use a public endpoint instead, which requires IAM authentication and TLS 1.3.

The cache's security group must allow inbound TCP from your application:

- **Node-based clusters:** port 6379, or the port you chose when you created the cluster.
- **Serverless:** ports 6379 and 6380. AWS recommends opening 6380 even if you don't read from replicas, because some clients connect to it anyway.

Use your application's security group as the rule's source rather than a CIDR range, so the rule follows the application as its addresses change. When a security group or route blocks the connection, the connection attempt waits for `socket.connectTimeout` (5 seconds by default) and then fails, and the adapter rejects or emits `error` as described in [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts). Set the adapter's `connectionTimeout` option to fail sooner. When Keyv builds the client, that value is also written to `socket.connectTimeout`, and `socket.reconnectStrategy` is set to `false` unless you already passed one. Pair it with the `reconnectStrategy` in [Failover and unresponsive nodes](#failover-and-unresponsive-nodes) when the client should reconnect after a later disconnect.

# Upstash

`@keyv/redis` connects to Upstash Redis over TCP, the Redis protocol, like any other Redis server. Use a URI or client options. `KeyvRedis` creates a client from a URI string, and passes an options object to `createClient` from `@redis/client`, unchanged except for `connectionTimeout` when you set it. So `url`, `socket`, and `pingInterval` below are standard `@redis/client` options. `createKeyv` accepts the same arguments. Upstash's [Connect Your Client](https://upstash.com/docs/redis/howto/connectclient) page is the reference for the provider details below.

`@keyv/redis` doesn't work with Upstash's HTTP REST API, so it can't run where TCP sockets aren't available, such as Cloudflare Workers, Vercel Edge Functions, and other edge runtimes. See [Edge and serverless runtimes](#edge-and-serverless-runtimes).

## Endpoint and token

Open the database in the Upstash Console. The **Connect** section's **TCP** tab shows the endpoint, the port, and a connection string. The console shows a **Token** and no separate password: the token is the password of the `default` user. The `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values in the same section are for HTTP clients, not for `@keyv/redis`.

TLS is always on for Upstash Redis and can't be turned off, so the URI uses the `rediss://` scheme (two `s`'s):

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const url = new URL(`rediss://${process.env.UPSTASH_REDIS_HOST}:${process.env.UPSTASH_REDIS_PORT ?? 6379}`);
url.username = 'default';
url.password = process.env.UPSTASH_REDIS_TOKEN;

const keyv = new Keyv(new KeyvRedis(url.toString()));
keyv.on('error', (error) => console.error('Upstash error', error));

await keyv.set('greeting', 'hello', 60_000);
console.log(await keyv.get('greeting')); // 'hello'
await keyv.disconnect();
```

Set `UPSTASH_REDIS_HOST` to the endpoint without the port, and `UPSTASH_REDIS_TOKEN` to the token. You can also keep the whole `rediss://default:<token>@<endpoint>:<port>` string from the **TCP** tab in one environment variable and pass it as the URI.

Keep these points in mind:

- A `redis://` URI connects without TLS, and Upstash resets the connection. Upstash's [ECONNRESET troubleshooting](https://upstash.com/docs/redis/troubleshooting/econn_reset) page covers this.
- Upstash's own Node.js example connects with a plain `rediss://` URI and no CA file, so you don't pass a `ca`. Leave `rejectUnauthorized` unset so Node.js verifies the certificate, and connect with the endpoint hostname, not an IP address.
- The **Read-Only Token** option switches the connection string to the `default_ro` user. Keyv writes as well as reads, so use the `default` user, or an ACL user that can run the commands Keyv sends, including `SCAN` for `clear()` and `iterator()`.

## Standalone, not cluster

Upstash [does not support sharding](https://upstash.com/docs/redis/help/faq), so a database is one endpoint that you reach with a URI or client options. Don't pass `rootNodes` or a client from `createCluster`. `KeyvRedis` sends `getMany`, `setMany`, `hasMany`, and `deleteMany` as one command or transaction each, which a standalone server accepts across any keys.

A [Global Database](https://upstash.com/docs/redis/features/globaldatabase) still has a single endpoint. Upstash sends writes to the primary region and can serve reads from a read region, and replication is eventually consistent, so a `get` right after a `set` can briefly return the old value or `undefined`.

## Idle connections and reconnecting

A `KeyvRedis` instance holds one long-lived TCP connection. Upstash doesn't document a fixed idle timeout, but the connection can still close: Upstash notes that clients may disconnect and reconnect when you upgrade the database, and a NAT gateway or load balancer between your application and Upstash can drop a connection that has been quiet. These `@redis/client` settings help:

- **TCP keepalive** is on by default in `@redis/client` (`socket.keepAlive`), and the first probe goes out after 30 seconds of silence (`socket.keepAliveInitialDelay`, `30000`).
- **`pingInterval`** sends `PING` on that interval, in milliseconds, so the connection carries traffic even when Keyv doesn't. Upstash's [billing page](https://upstash.com/docs/redis/overall/billing) lists `PING` among the commands it doesn't bill.
- **`socket.reconnectStrategy`** decides whether to reconnect after the connection closes. A URI string gets the adapter's [`defaultReconnectStrategy`](#helpers). With an options object, `@redis/client` uses its own strategy, which doesn't reconnect after a socket timeout. Pass `defaultReconnectStrategy`, which `@keyv/redis` exports, to reconnect in every case.

```js
import Keyv from 'keyv';
import KeyvRedis, { defaultReconnectStrategy } from '@keyv/redis';

const url = new URL(`rediss://${process.env.UPSTASH_REDIS_HOST}:${process.env.UPSTASH_REDIS_PORT ?? 6379}`);
url.username = 'default';
url.password = process.env.UPSTASH_REDIS_TOKEN;

const keyv = new Keyv(new KeyvRedis({
  url: url.toString(),
  pingInterval: 60_000,
  socket: {
    tls: true,
    reconnectStrategy: defaultReconnectStrategy,
  },
}));
keyv.on('error', (error) => console.error('Upstash error', error));
```

If you set the adapter's `connectionTimeout` option, Keyv also sets `socket.reconnectStrategy` to `false` unless you already passed one, and that applies to a URI string too. Use an options object with `reconnectStrategy: defaultReconnectStrategy`, as shown, when you want both. `socket.socketTimeout` is covered in [Failover and unresponsive nodes](#failover-and-unresponsive-nodes). Each `PING` refreshes it, so don't combine it with `pingInterval` when you rely on it to detect a server that stopped responding.

Commands sent while the client reconnects wait in its offline queue. If Keyv is a cache in front of another data source and shouldn't hold up a request, see [Using the `createKeyvNonBlocking` function](#using-the-createkeyvnonblocking-function) and [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts).

## Free tier and command limits

Upstash bills and limits by the number of commands, and commands sent over TCP count the same as REST requests. Check the [Pricing & Billing](https://upstash.com/docs/redis/overall/billing) page and the [pricing page](https://upstash.com/pricing/redis) for current numbers, since they change. When this guide was written, the free tier allowed one database with 250 MB of data and 500K commands a month, and every plan had a commands-per-second limit above which Upstash throttles requests.

How Keyv's operations count:

- `get`, `set`, `has`, and `delete` send one command each. Before its first `set` with a TTL or its first `setMany`, the adapter also sends `INFO server` once to check for `PXAT` support. Upstash doesn't bill `INFO`.
- `getMany` sends one `MGET`. `setMany`, `hasMany`, and `deleteMany` send a `MULTI`/`EXEC` transaction with one command per key, and Upstash bills a transaction of N commands as N + 2.
- `clear()` sends a `SCAN` for each batch of `clearBatchSize` keys plus an `UNLINK` (or `DEL`) for the keys it found. `iterator()` sends a `SCAN` and an `MGET` for each batch. On a large database, these add up.

What happens at a limit depends on the plan. Upstash's [FAQ](https://upstash.com/docs/redis/help/faq) says commands over a free database's request limit return an error. Its billing page says a pay-as-you-go database with a monthly budget is rate-limited once it reaches the budget. With an `error` listener attached, Keyv turns a failed command into a fallback value, such as `undefined` from `get`, as described in [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts).

Upstash's eviction is off by default, so a full database rejects writes. Turn eviction on in the console when you use the database only as a cache. See [Eviction](https://upstash.com/docs/redis/features/eviction).

## Edge and serverless runtimes

`@keyv/redis` needs a TCP socket, which edge runtimes such as Cloudflare Workers, Vercel Edge Functions, and Fastly Compute don't provide. Upstash's answer for those runtimes is its HTTP REST API and the `@upstash/redis` SDK, and `@keyv/redis` supports neither.

For HTTP access from Keyv, the third-party [`keyv-upstash`](https://github.com/mahdavipanah/keyv-upstash) adapter wraps `@upstash/redis`. It isn't maintained in this repository, and it was last published before Keyv v6. Keyv v6 runs adapters that don't declare the v6 storage contract through `KeyvBridgeAdapter`, as described in [Legacy Storage Adapters](https://keyv.org/docs/legacy-storage-adapters/). Check its README for the Keyv versions it supports, and test TTLs and `clear()` before you rely on it.

Serverless functions on Node.js, such as AWS Lambda, can use `@keyv/redis` over TCP. Create the Keyv instance once at module scope so warm invocations reuse its connection. Many concurrent instances each hold a connection, and Upstash rejects new ones with `ERR max concurrent connections exceeded` when a database reaches its connection limit. See [max concurrent connections](https://upstash.com/docs/redis/troubleshooting/max_concurrent_connections).

# API

`KeyvRedis` extends [Hookified](https://hookified.org) (`on`, `once`, `emit`, hooks) and implements the Keyv storage adapter contract. Missing keys and swallowed errors return `undefined` (never `null`).

## Properties
* **capabilities** - Adapter capability descriptor. `capabilities.expires` is `true` (absolute Unix-ms `expires` on `set` / `setMany`).
* **client** - The Redis client, cluster, or sentinel connection. Assigning a new connection re-wires Hookified event listeners and resets PXAT detection. Type: `RedisClientConnectionType`.
* **namespace** - Namespace used to prefix keys. `undefined` means no prefixing. Default: `undefined`.
* **namespaceSeparator** - Separator between namespace and key. May be `""`. Default: `"::"`.
* **clearBatchSize** - `SCAN` / delete batch size. Must be greater than `0` or an `error` event is emitted. Default: `1000`.
* **useUnlink** - Use `UNLINK` instead of `DEL`. Default: `true`.
* **noNamespaceAffectsAll** - When no namespace is set, `clear()` / `iterator()` affect all keys (including namespaced ones). Default: `false`.
* **throwOnConnectError** - Throw when connect fails, with the connection error as the `cause`, instead of emitting `error`. Default: `true`.
* **throwOnErrors** - Throw on operation failures instead of emitting `error` and returning a no-op. Default: `false`.
* **connectionTimeout** - Timeout in milliseconds for the full connect handshake (TCP plus Redis HELLO / AUTH). `undefined` uses the Redis client default. On expiry the in-flight connect is aborted so sockets and timers are not left active. Aborting destroys the client, which rejects the commands it had queued: a client you passed in connects again on the next operation, and a client Keyv constructed is replaced. When Keyv constructs the client, this is also passed as `socket.connectTimeout` unless that option is already set. Auto-reconnect is disabled unless you pass `socket.reconnectStrategy`. A TCP connect that is still pending can't be aborted, so on a client you pass in, set `socket.connectTimeout` no higher than `connectionTimeout`.

## Methods
* **constructor([connect], [options])** - `connect` is a URI string, client/cluster/sentinel options (`KeyvRedisConnect`), or an existing connection. See [Keyv Redis Options](#keyv-redis-options).
* **getClient()** - Return the ready client, connecting first if needed. Concurrent callers share the in-flight connect and wait until `isReady` (not only `isOpen`). On `connectionTimeout`, the hung handshake is aborted so sockets are not left open, and a client you passed in connects again on the next call. Returns `Promise<RedisClientConnectionType>`.
* **set(key, value, [expires])** - Set a key. `expires` is an absolute Unix timestamp in milliseconds. Returns `Promise<boolean>`. Through Keyv, pass a relative millisecond `ttl` to `keyv.set` — Keyv converts it to `expires`.
* **setMany(entries)** - Set `KeyvStorageEntry` objects (`{ key, value, expires? }`) via `MULTI/EXEC`. Returns `Promise<boolean[]>` (per-entry success). Cluster mode groups by hash slot.
* **get(key)** - Get a key. Returns the value or `undefined` if missing (Redis `null` is mapped to `undefined`).
* **getMany(keys)** - Get multiple keys. Each missing entry is `undefined`.
* **has(key)** - Returns `Promise<boolean>`.
* **hasMany(keys)** - Returns `Promise<boolean[]>`.
* **delete(key)** - Returns `Promise<boolean>`.
* **deleteMany(keys)** - Returns `Promise<boolean[]>`.
* **clear()** - Clear keys in the namespace. With no namespace, clears un-prefixed keys unless `noNamespaceAffectsAll` is `true` (`FLUSHDB`).
* **iterator()** - Async generator of `[key, value]` pairs. Uses the instance namespace. Missing values are `undefined`.
* **disconnect([force])** - Graceful `close()` (`QUIT`) when `force` is false; `destroy()` when `true`.
* **createKeyPrefix(key, [namespace])** - Returns `namespace::key` (or `key` when namespace is omitted).
* **getKeyWithoutPrefix(key, [namespace])** - Strips a leading namespace prefix.
* **isCluster()** - `true` if the connection is a Redis cluster.
* **isSentinel()** - `true` if the connection is a Redis sentinel.
* **getMasterNodes()** - Cluster master node clients, or `[client]` when standalone.

## Helpers
* **createKeyv([connect], [options])** - Keyv instance with this adapter. Applies `namespace` on both Keyv and the store. `connect` accepts the same `KeyvRedisConnect` types as the constructor (including cluster/sentinel). Defaults to `"redis://localhost:6379"` when `connect` is omitted.
* **createKeyvNonBlocking([connect], [options])** - Same as `createKeyv`, then disables throws, the offline queue, and reconnect for secondary-cache use. A client passed in keeps its own reconnect strategy, and cluster and sentinel connections only have their throw settings changed. See [Using the `createKeyvNonBlocking` function](#using-the-createkeyvnonblocking-function). Concurrent operations wait for the shared in-flight connect instead of being dropped.
* **defaultReconnectStrategy(attempts)** - Default socket reconnect delay when a URI string is passed to the constructor. Exponential backoff capped at 2s, plus up to ±50ms of jitter. Returns a delay in milliseconds.

# Events

`KeyvRedis` extends Hookified and re-emits these events from the Redis client onto the adapter:

| Event | Payload | When |
| --- | --- | --- |
| `error` | `Error` (or a string for invalid `clearBatchSize`) | Client errors, and connect or operation failures that the adapter does not reject (see `throwOnConnectError` and `throwOnErrors`) |
| `connect` | the Redis connection | The client connects |
| `disconnect` | the Redis connection | The client disconnects |
| `reconnecting` | reconnect info from `@redis/client` | The client is reconnecting |

```js
import {createKeyv} from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379');
const store = keyv.store;

store.on('error', (error) => {
  console.error('adapter error', error);
});

store.on('connect', () => {
  console.log('Redis connected');
});

store.once('disconnect', () => {
  console.log('Redis disconnected');
});

store.on('reconnecting', () => {
  console.log('Redis reconnecting');
});
```

`error`, `connect`, `disconnect`, and `reconnecting` are re-emitted on the adapter. Other Redis-client-only events (for example `ready`) can still be listened on `store.client`:

```js
store.client.on('ready', () => {
  console.log('Redis client ready');
});
```

Client events: https://www.npmjs.com/package/redis#events

# Migrating from v3 to v4

> **Note:** This section applies to versions before v6. Keyv v6 removed the `useKeyPrefix` option: TypeScript rejects it and JavaScript ignores it. In v6 the adapter owns namespacing, so leave the option out. See [Fixing Double Prefixing of Keys](#fixing-double-prefixing-of-keys).

Overall the API is the same as v3 with additional options and performance improvements. Here are the main changes:
* The `ioredis` library has been removed in favor of the `redis` aka `node-redis` library. If you want to use ioredis you can use `@keyv/valkey`
* The `useUnlink` option has been added to use `UNLINK` instead of `DEL` and set to true by default.
* The `clearBatchSize` option has been added to set the number of keys to delete in a single batch.
* The `clear()` and `delete()` methods now use `UNLINK` instead of `DEL`. If you want to use `DEL` you can set the `useUnlink` option to `false`.
* BREAKING: We no longer support redis sets. This is due to the fact that it caused significant performance issues and was not a good fit for the library.
* BREAKING: YOUR PREVIOUS KEYS WILL NOT BE VALID. This is because of the fixe of the namespace support and how it is handled. Now, when using `keyv` with `@keyv/redis` as the storage adapter you can do the following:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const redis = new KeyvRedis('redis://user:pass@localhost:6379');
const keyv = new Keyv({ store: redis, namespace: 'my-namespace', useKeyPrefix: false });
```

This will make it so the storage adapter `@keyv/redis` will handle the namespace and not the `keyv` instance. If you leave it on it will just look duplicated like `my-namespace:my-namespace:key`.

# About Redis Sets and its Support in v4

We no longer support redis sets. This is due to the fact that it caused significant performance issues and was not a good fit for the library.

# Using with NestJS

> You can integrate `@keyv/redis` with NestJS by creating a custom `CacheModule`. This allows you to use Keyv as a cache store in your application.

> **Note:** `cache-manager` 7 depends on Keyv v5. It reads expiry data with `store.get(key, { raw: true })`, which a v6 `Keyv` ignores, so `ttl()` and the refresh logic in `wrap()` stop working with a v6 store. Check which Keyv version your `cache-manager` needs with `npm view cache-manager dependencies.keyv`. See [Libraries That Embed Keyv v5](https://keyv.org/docs/migration/v5-to-v6/#libraries-that-embed-keyv-v5).

### 1. Install Dependencies

```bash
npm install @keyv/redis keyv @nestjs/cache-manager cache-manager cacheable
```

### 2. Create a Cache Module

Create a file `cache.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({
        stores: [createKeyv('redis://localhost:6379')],
      }),
    }),
  ],
  providers: [],
  exports: [],
})
export class CacheModule {}
```

### 3. Import the Cache Module in AppModule
Update `app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule } from './modules/config/cache/cache.module';

@Module({
  imports: [
    CacheModule, // Import your custom cache module
    // other modules...
  ],
})
export class AppModule {}
```

### 4. Create the Cache Service
Create a file `cache.service.ts`:

```ts
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    await this.cacheManager.set(key, value, ttl);
    return true;
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
```

### 5. Register CacheService in CacheModule
Update `cache.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { CacheService } from './services/cache.service';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: () => ({
        stores: [createKeyv('redis://localhost:6379')],
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
```
### 6. Import CacheModule in the Target Module (e.g. TaskModule)
```ts
import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskRepository } from './repositories/task.repository';
import { CacheModule } from 'src/modules/config/cache/cache.module';

@Module({
  imports: [CacheModule],
  providers: [TaskService, TaskRepository],
})
export class TaskModule {}
```

### 7. Using the Cache in a Service

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskRepository } from '../repositories/task.repository';
import { TaskDto } from '../dto/task.dto';
import { CacheService } from 'src/modules/config/cache/services/cache.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly cache: CacheService, // Inject the CacheService
  ) {}

  async findById(id: number): Promise<TaskDto> {
    const cacheKey = `task:${id}`;

    // 1. Try to get from cache
    const cached = await this.cache.get<TaskDto>(cacheKey);
    
	if (cached) {
      return cached;
    }

    // 2. If not found in cache, fetch from database
    const task = await this.taskRepository.findById(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // 3. Set in cache for future requests
    await this.cache.set(cacheKey, task, 300 * 1000); // 5 minutes TTL
    return task;
  }
}
```


You can learn more about caching in NestJS in the [official documentation](https://docs.nestjs.com/techniques/caching#in-memory-cache).


---


# License

[MIT © Jared Wray](LICENSE)
