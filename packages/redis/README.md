# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Redis storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)
[![npm](https://img.shields.io/npm/dm/@keyv/redis)](https://npmjs.com/package/@keyv/redis)

Redis storage adapter for [Keyv](https://github.com/jaredwray/keyv).

# Features
* Built on top of [redis](https://npmjs.com/package/redis).
* TTL is handled directly by Redis.
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
* [Namespaces](#namespaces)
* [Performance Considerations](#performance-considerations)
* [High Memory Usage on Redis Server](#high-memory-usage-on-redis-server)
* [Using Cacheable with Redis](#using-cacheable-with-redis)
* [Clustering and TLS Support](#clustering-and-tls-support)
* [API](#api)
* [Migrating from v3 to v4](#migrating-from-v3-to-v4)
* [About Redis Sets and its Support in v4](#about-redis-sets-and-its-support-in-v4)
* [License](#license)

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

const keyv = createKeyv('redis://user:pass@localhost:6379', { namespace: 'my-namespace' });
```

You only have to import the `@keyv/redis` library if you are using the `createKeyv` function. 🎉 Otherwise, you can import `Keyv` and `@keyv/redis` independently.

Here you can pass in the Redis options directly:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const redisOptions = {
  url: 'redis://localhost:6379', // The Redis server URL (use 'rediss' for TLS)
  password: 'your_password', // Optional password if Redis has authentication enabled

  socket: {
    host: 'localhost', // Hostname of the Redis server
    port: 6379,        // Port number
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000), // Custom reconnect logic

    tls: false, // Enable TLS if you need to connect over SSL
    keepAlive: 30000, // Keep-alive timeout (in milliseconds)
  }
};

const keyv = new Keyv(new KeyvRedis(redisOptions));
```

Or you can create a new Redis instance and pass it in with `KeyvOptions`:

```js
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';

const redis = createClient('redis://user:pass@localhost:6379', { namespace: 'my-namespace'});
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis });
```

# Namespaces

You can set a namespace for your keys. This is useful if you want to manage your keys in a more organized way. Here is an example of how to set a namespace:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { namespace: 'my-namespace' }));
```

This will prefix all keys with `my-namespace:`. You can also set the namespace after the fact:

```js
keyv.namespace = 'my-namespace';
```

NOTE: If you plan to do many clears or deletes, it is recommended to read the [Performance Considerations](#performance-considerations) section.

# Performance Considerations

With namespaces being prefix based it is critical to understand some of the performance considerations we have made:
* `clear()` - We use the `SCAN` command to iterate over keys. This is a non-blocking command that is more efficient than `KEYS`. In addition we are using `UNLINK` by default instead of `DEL`. Even with that if you are iterating over a large dataset it can still be slow. It is highly recommended to use the `namespace` option to limit the keys that are being cleared and if possible to not use the `clear()` method in high performance environments. If you don't set namespaces, you can enable `noNamespaceAffectsAll` to clear all keys using the `FLUSHDB` command which is faster and can be used in production environments.

* `delete()` - By default we are now using `UNLINK` instead of `DEL` for deleting keys. This is a non-blocking command that is more efficient than `DEL`. If you are deleting a large number of keys it is recommended to use the `deleteMany()` method instead of `delete()`.

* `clearBatchSize` - The `clearBatchSize` option is set to `1000` by default. This is because Redis has a limit of 1000 keys that can be deleted in a single batch. If no namespace is defined and noNamespaceAffectsAll is set to `true` this option will be ignored and the `FLUSHDB` command will be used instead.

* `useUnlink` - This option is set to `true` by default. This is because `UNLINK` is a non-blocking command that is more efficient than `DEL`. If you are not using `UNLINK` and are doing a lot of deletes it is recommended to set this option to `true`.

* `setMany`, `getMany`, `deleteMany` - These methods are more efficient than their singular counterparts. These will be used by default in the `Keyv` library such as when using `keyv.delete(string[])` it will use `deleteMany()`.

If you want to see even better performance please see the [Using Cacheable with Redis](#using-cacheable-with-redis) section as it has non-blocking and in-memory primary caching that goes along well with this library and Keyv.

# High Memory Usage on Redis Server

This is because we are using `UNLINK` by default instead of `DEL`. This is a non-blocking command that is more efficient than `DEL` but will slowly remove the memory allocation. 

If you are deleting or clearing a large number of keys you can disable this by setting the `useUnlink` option to `false`. This will use `DEL` instead of `UNLINK` and should reduce the memory usage.

```js
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { useUnlink: false }));
// Or
keyv.useUnlink = false;
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

# Clustering and TLS Support

If you are using a Redis Cluster or need to use TLS, you can pass in the `redisOptions` directly. Here is an example of how to do that:

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

Here is an example of how to use TLS:

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

# API
* **constructor([connection], [options])**
* **namespace** - The namespace to use for the keys.
* **client** - The Redis client instance.
* **keyPrefixSeparator** - The separator to use between the namespace and key.
* **clearBatchSize** - The number of keys to delete in a single batch.
* **useUnlink** - Use the `UNLINK` command for deleting keys isntead of `DEL`.
* **noNamespaceAffectsAll**: Whether to allow clearing all keys when no namespace is set (default is `false`).
* **set** - Set a key.
* **setMany** - Set multiple keys.
* **get** - Get a key.
* **getMany** - Get multiple keys.
* **has** - Check if a key exists.
* **hasMany** - Check if multiple keys exist.
* **delete** - Delete a key.
* **deleteMany** - Delete multiple keys.
* **clear** - Clear all keys in the namespace. If the namespace is not set it will clear all keys that are not prefixed with a namespace unless `noNamespaceAffectsAll` is set to `true`.
* **disconnect** - Disconnect from the Redis server.
* **iterator** - Create a new iterator for the keys. If the namespace is not set it will iterate over all keys that are not prefixed with a namespace unless `noNamespaceAffectsAll` is set to `true`.

# Migrating from v3 to v4

Overall the API is the same as v3 with additional options and performance improvements. Here are the main changes:
* The `ioredis` library has been removed in favor of the `redis` aka `node-redis` library. If you want to use ioredis you can use `@keyv/keyval`
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

# License

[MIT © Jared Wray](LISCENCE)
