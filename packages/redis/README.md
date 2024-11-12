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

## Usage

Here is a standard use case where we implement `Keyv` and `@keyv/redis`:

```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
keyv.on('error', handleConnectionError);
```

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

Here is the same example but with the `Keyv` instance created with the `createKeyv` function:

```js
import { createKeyv } from '@keyv/redis';

const keyv = createKeyv('redis://user:pass@localhost:6379', { namespace: 'my-namespace' });
```

You only have to import the `@keyv/redis` library if you are using the `createKeyv` function. 🎉 Otherwise, you can import `Keyv` and `@keyv/redis` independently.

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
* **set** - Set a key.
* **setMany** - Set multiple keys.
* **get** - Get a key.
* **getMany** - Get multiple keys.
* **has** - Check if a key exists.
* **hasMany** - Check if multiple keys exist.
* **delete** - Delete a key.
* **deleteMany** - Delete multiple keys.
* **clear** - Clear all keys. If the `namespace` is set it will only clear keys with that namespace.
* **disconnect** - Disconnect from the Redis server.
* **iterator** - Create a new iterator for the keys.





# Migrating from v3 to v4

The main change in v4 is the removal of the `ioredis` library in favor of the `@keyv/redis` library. This was done to provide a more consistent experience across all Keyv storage adapters. The `@keyv/redis` library is a wrapper around the `redis` library and provides a more consistent experience across all Keyv storage adapters. The only other change is that we no longer do redis sets as they caused performance issues.

# About Redis Sets and its Support in v4

We no longer support redis sets. This is due to the fact that it caused significant performance issues and was not a good fit for the library. We recommend using the `@keyv/redis` library for all your needs.

# License

[MIT © Jared Wray](LISCENCE)
