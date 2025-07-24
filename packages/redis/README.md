# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Redis storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)
[![npm](https://img.shields.io/npm/dm/@keyv/redis)](https://npmjs.com/package/@keyv/redis)

Redis storage adapter for [Keyv](https://github.com/jaredwray/keyv).

# Features
* Built on top of [@redis/client](https://npmjs.com/package/@redis/client).
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
* [Migrating from v4 to v5](#migrating-from-v4-to-v5)
* [Using the createKeyv function](#using-the-createkeyv-function)
* [Using the createKeyvNonBlocking function](#using-the-createkeyvnonblocking-function)
* [Namespaces](#namespaces)
* [Fixing Double Prefixing of Keys](#fixing-double-prefixing-of-keys)
* [Using Generic Types](#using-generic-types)
* [Performance Considerations](#performance-considerations)
* [High Memory Usage on Redis Server](#high-memory-usage-on-redis-server)
* [Gracefully Handling Errors and Timeouts](#gracefully-handling-errors-and-timeouts)
* [Using Cacheable with Redis](#using-cacheable-with-redis)
* [Clustering and TLS Support](#clustering-and-tls-support)
* [API](#api)
* [Using Custom Redis Client Events](#using-custom-redis-client-events)
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

Or you can create a new Redis instance and pass it in with `KeyvOptions` such as setting the `store`:

```js
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';

const redis = createClient('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis});
```

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
	keyPrefixSeparator?: string;
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
	 * Defaults to `false`.
	 */
	noNamespaceAffectsAll?: boolean;

	/**
	 * This is used to throw an error if the client is not connected when trying to connect. By default, this is
	 * set to true so that it throws an error when trying to connect to the Redis server fails.
	 */
	throwOnConnectError?: boolean;

	/**
	 * This is used to throw an error if at any point there is a failure. Use this if you want to
	 * ensure that all operations are successful and you want to handle errors. By default, this is
	 * set to false so that it does not throw an error on every operation and instead emits an error event
	 * and returns no-op responses.
	 * @default false
	 */
	throwOnErrors?: boolean;

	/**
	 * Timeout in milliseconds for the connection. Default is undefined, which uses the default timeout of the Redis client.
	 * If set, it will throw an error if the connection does not succeed within the specified time.
   * @default undefined
	 */
	connectionTimeout?: number;
};
```
You can pass these options when creating a new `KeyvRedis` instance:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyvRedis = new KeyvRedis({
  namespace: 'my-namespace',
  keyPrefixSeparator: ':',
  clearBatchSize: 1000,
  useUnlink: true,
  noNamespaceAffectsAll: false,
  connectTimeout: 200
});

const keyv = new Keyv({ store: keyvRedis });
```

You can also set these options after the fact by using the `KeyvRedis` instance properties:

```js
import {createKeyv} from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379');
keyv.store.namespace = 'my-namespace';
```

# Using the `createKeyv` function

The `createKeyv` function is a convenience function that creates a new `Keyv` instance with the `@keyv/redis` store. It automatically sets the `useKeyPrefix` option to `false`. Here is an example of how to use it:

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

The `createKeyvNonBlocking` function is a convenience function that creates a new `Keyv` instance with the `@keyv/redis` store does what `createKeyv` does but also disables throwing errors, removes the offline queue redis functionality, and reconnect strategy so that when used as a secondary cache in libraries such as [cacheable](https://npmjs.org/package/cacheable) it does not block the primary cache. This is useful when you want to use Redis as a secondary cache and do not want to block the primary cache on connection errors or timeouts when using `nonBlocking`. Here is an example of how to use it:

```js
import { createKeyvNonBlocking } from '@keyv/redis';
const keyv = createKeyvNonBlocking('redis://user:pass@localhost:6379');
```

# Namespaces

You can set a namespace for your keys. This is useful if you want to manage your keys in a more organized way. Here is an example of how to set a `namespace` with the `store` option:

```js
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';

const redis = createClient('redis://user:pass@localhost:6379');
const keyvRedis = new KeyvRedis(redis);
const keyv = new Keyv({ store: keyvRedis, namespace: 'my-namespace', useKeyPrefix: false });
```

To make this easier, you can use the `createKeyv` function which will automatically set the `namespace` option to the `KeyvRedis` instance:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379', { namespace: 'my-namespace' });
```

This will prefix all keys with `my-namespace:` and will also set `useKeyPrefix` to `false`. This is done to avoid double prefixing of keys as we transition out of the legacy behavior in Keyv. You can also set the namespace after the fact:

```js
keyv.namespace = 'my-namespace';
```

NOTE: If you plan to do many clears or deletes, it is recommended to read the [Performance Considerations](#performance-considerations) section.

# Fixing Double Prefixing of Keys

If you are using `Keyv` with `@keyv/redis` as the storage adapter, you may notice that keys are being prefixed twice. This is because `Keyv` has a default prefixing behavior that is applied to all keys. To fix this, you can set the `useKeyPrefix` option to `false` when creating the `Keyv` instance:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'), { useKeyPrefix: false });
```

To make this easier, you can use the `createKeyv` function which will automatically set the `useKeyPrefix` option to `false`:

```js
import { createKeyv } from '@keyv/redis';
const keyv = createKeyv('redis://user:pass@localhost:6379');
```

## Using Generic Types

When initializing `KeyvRedis`, you can specify the type of the values you are storing and you can also specify types when calling methods:

```typescript
import Keyv from 'keyv';
import KeyvRedis, { createClient } from '@keyv/redis';


type User {
  id: number
  name: string
}

const redis = createClient('redis://user:pass@localhost:6379');

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

# High Memory Usage on Redis Server

This is because we are using `UNLINK` by default instead of `DEL`. This is a non-blocking command that is more efficient than `DEL` but will slowly remove the memory allocation. 

If you are deleting or clearing a large number of keys you can disable this by setting the `useUnlink` option to `false`. This will use `DEL` instead of `UNLINK` and should reduce the memory usage.

```js
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379', { useUnlink: false }));
// Or
keyv.useUnlink = false;
```

# Gracefully Handling Errors and Timeouts

When using `@keyv/redis`, it is important to handle connection errors gracefully. You can do this by listening to the `error` event on the `KeyvRedis` instance. Here is an example of how to do that:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
keyv.on('error', (error) => {
  console.error('error', error);
});
```

By default, the `KeyvRedis` instance will `throw an error` if the connection fails to connect. You can disable this behavior by setting the `throwOnConnectError` option to `false` when creating the `KeyvRedis` instance. If you want this to throw you will need to also set the Keyv instance to `throwOnErrors: true`:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://bad-uri:1111', { throwOnConnectError: false }));
keyv.throwOnErrors = true; // This will throw an error if the connection fails

await keyv.set('key', 'value'); // this will throw the connection error only.
```

On `get`, `getMany`, `set`, `setMany`, `delete`, and `deleteMany`, if the connection is lost, it will emit an error and return a no-op value. You can catch this error and handle it accordingly. This is important to ensure that your application does not crash due to a lost connection to Redis.

If you want to handle connection errors, retries, and timeouts more gracefully, you can use the `throwOnErrors` option. This will throw an error if any operation fails, allowing you to catch it and handle it accordingly:

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
* **keyPrefixSeparator** - The separator to use between the namespace and key. It can be set to a blank string.
* **clearBatchSize** - The number of keys to delete in a single batch. Has to be greater than 0. Default is `1000`.
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
* **disconnect** - Disconnect from the Redis server using `Quit` command. If you set `force` to `true` it will force the disconnect.
* **iterator** - Create a new iterator for the keys. If the namespace is not set it will iterate over all keys that are not prefixed with a namespace unless `noNamespaceAffectsAll` is set to `true`.

# Using Custom Redis Client Events

Keyv by default supports the `error` event across all storage adapters. If you want to listen to other events you can do so by accessing the `client` property of the `KeyvRedis` instance. Here is an example of how to do that:

```js
import {createKeyv} from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379');
const redisClient = keyv.store.client;

redisClient.on('connect', () => {
  console.log('Redis client connected');
});

redisClient.on('reconnecting', () => {
  console.log('Redis client reconnecting');
});

redisClient.on('end', () => {
  console.log('Redis client disconnected');
});
```

Here are some of the events you can listen to: https://www.npmjs.com/package/redis#events

# Migrating from v3 to v4

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

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
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

[MIT © Jared Wray](LISCENCE)
