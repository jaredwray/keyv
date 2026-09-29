# v4 to v5 changes

A v4 project needs these changes before the ones in [v5-to-v6.md](v5-to-v6.md). Go straight to v6; don't stop at v5. Keys that v4 wrote are covered in [stored-data.md](stored-data.md).

## Adapters instead of connection strings

v4 read a connection string, or the `adapter` option, and loaded the matching `@keyv/*` package. v5 and v6 don't. They also don't reject a string: `new Keyv('redis://…')` and `new Keyv({ uri: '…' })` silently use an in-memory store, and TypeScript accepts both. Install the adapter package and pass an instance.

```js
// v4
const keyv = new Keyv('redis://user:pass@localhost:6379');
const keyv = new Keyv({ uri: 'sqlite://cache.sqlite', table: 'cache', namespace: 'app' });

// v6
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import KeyvSqlite from '@keyv/sqlite';

const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
const keyv = new Keyv(new KeyvSqlite({ uri: 'sqlite://cache.sqlite', table: 'cache' }), { namespace: 'app' });
```

v4 passed every extra Keyv option through to the adapter. Move adapter options (`table`, `keySize`, `collection`, `schema`, `busyTimeout`, and the like) into the adapter constructor, and keep Keyv options (`namespace`, `ttl`, `compression`, `serialization`, `stats`) in Keyv's.

| v4 scheme or `adapter` | v6 package | v6 construction |
| --- | --- | --- |
| `redis://`, `rediss://` | `@keyv/redis` | `new KeyvRedis(uri, options)` |
| `mongodb://`, `mongo` | `@keyv/mongo` | `new KeyvMongo(uri, { collection })` |
| `sqlite://` | `@keyv/sqlite` | `new KeyvSqlite({ uri, table })` |
| `postgresql://`, `postgres://` | `@keyv/postgres` | `new KeyvPostgres({ uri, table, schema })` |
| `mysql://` | `@keyv/mysql` | `new KeyvMysql({ uri, table })` |
| `etcd://` | `@keyv/etcd` | `new KeyvEtcd(url, options)` |
| `offline:`, `tiered:` | removed | See [dependencies.md](dependencies.md) |

Some adapter options were renamed in v6: `keySize` is `keyLength` for PostgreSQL and MySQL. See [adapters.md](adapters.md).

## CommonJS

v4 exported the class as the module (`module.exports = Keyv`). In v6, `require('keyv')` returns an object with `Keyv` and `default`, so the v4 form throws `Keyv is not a constructor`.

```js
// v4
const Keyv = require('keyv');
const KeyvRedis = require('@keyv/redis');

// v6
const { Keyv } = require('keyv');
const KeyvRedis = require('@keyv/redis').default;   // @keyv/redis has no named class export
const { KeyvSqlite } = require('@keyv/sqlite');     // other adapters export the class by name too
```

## Types

v4 declared `Keyv<Value, Options>` and put its types in a namespace (`Keyv.Options`, `Keyv.Store`, `Keyv.DeserializedData`). v6 takes one type parameter and uses named exports:

```ts
// v4
import Keyv = require('keyv');
const keyv: Keyv<User, { table: string }> = new Keyv({ uri, table: 'users' });
function build(options: Keyv.Options<User>) {}

// v6
import Keyv, { type KeyvOptions, type KeyvStorageAdapter, type KeyvValue } from 'keyv';
const keyv = new Keyv<User>(new KeyvSqlite({ uri, table: 'users' }));
function build(options: KeyvOptions) {}
```

## Behavior

- **Return values.** v4's `set` always resolved `true`, and `delete(keys)` with an array resolved one boolean (`true` only when every key was deleted). In v6, `set` resolves `false` on a failure (or rejects; see [Errors](#errors)), `delete(key)` with one key still resolves a boolean, and `delete(keys)` with an array and `deleteMany(keys)` resolve `boolean[]`. Code that passes either a key or an array must handle both shapes.
- **Raw values.** v4 stored `expires: null` for entries without a TTL. v6 leaves `expires` out, so compare with `undefined`, and check code that reads `.expires` from raw values. Use `getRaw` instead of `get(key, { raw: true })`.
- **Construction.** `new Keyv({ store, namespace, ttl })` still works once `store` is an adapter instance.
- **`has`.** v4 took one key. v6 also takes an array, and adds `hasMany`.
- **Iterator.** v4 attached `iterator` only for a `Map` and some adapters, and you passed the namespace: `keyv.iterator(keyv.opts.namespace)`. In v6, `keyv.iterator()` always exists and takes no arguments.
- **Events.** v4 extended Node.js `EventEmitter` and had a constructor-only `emitErrors` option. v6 uses Hookified, removes `emitErrors`, and changes when failures throw; see [Errors](#errors).
- **Serialization.** v4 used `json-buffer`. v6's built-in serializer writes the same format, so uncompressed v4 values stay readable. v4's `serialize` and `deserialize` options become `serialization: { stringify, parse }`.
- **Compression.** In v4, a compression adapter replaced `serialize` and `deserialize`. v6 compression adapters have a different interface, and v6 can't read values v4 compressed.

## Errors

In v4, a call rejected whenever the store failed, **whether or not an `error` listener was attached**. The listener only received errors the store emitted on its own, such as a dropped connection; with no listener, those crashed the process, as with any Node.js `EventEmitter`. So v4 docs told apps to add `keyv.on('error', handler)` for connection errors, and many did, while still expecting calls to reject.

In v6, a listener changes what calls return: with one attached, a failed call resolves to a fallback value (`get` → `undefined`, `set` → `false`) instead of rejecting. A v4 app that has a listener and relies on calls rejecting (a `try`/`catch` around Keyv calls, or a failed `get` treated differently from a miss) changes behavior silently. See [v5-to-v6.md](v5-to-v6.md#errors) for the options, and tell the user which one you chose.

## `@keyv/redis` moved to the official Redis client

The v4-era `@keyv/redis` 2.x was built on `ioredis`. v6 uses `@redis/client`, so an `ioredis` instance or `ioredis` options can't be passed in.

```js
// v4
import Redis from 'ioredis';
const keyv = new Keyv({ store: new KeyvRedis(new Redis({ host, port, password, db: 2 })) });

// v6
import KeyvRedis, { createClient, createCluster } from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis(`redis://:${password}@${host}:${port}/2`));
// or pass a client you created
const keyv = new Keyv(new KeyvRedis(createClient({ url: 'redis://localhost:6379' })));
const cluster = new Keyv(new KeyvRedis(createCluster({ rootNodes: [{ url: 'redis://127.0.0.1:7000' }] })));
```

v4's `useRedisSets` option is gone from `@keyv/redis`. Keys that v4 wrote need a matching `keyPrefixSeparator`; see [stored-data.md](stored-data.md).

## Memcache credentials

v4-era `@keyv/memcache` took credentials in the server string. v6 takes them as options:

```js
// v4
new KeyvMemcache('user:pass@localhost:11211');

// v6
new KeyvMemcache('localhost:11211', { sasl: { username: 'user', password: 'pass' } });
```
