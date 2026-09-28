# Changes in each package

Every package below is released at the same version as `keyv` from v6 on. All of them extend Hookified, declare the v6 storage contract, and take an absolute `expires` timestamp when you call them directly (see [Calling an adapter directly](#calling-an-adapter-directly)). Keys that the old versions wrote are covered in [stored-data.md](stored-data.md).

## `@keyv/redis`

- Built on the official `redis` client (`@redis/client` v6). The v4-era 2.x line used `ioredis`; see [v4-to-v5.md](v4-to-v5.md#keyvredis-moved-to-the-official-redis-client).
- `new KeyvRedis(connect, options)` takes a connection string, `redis` client options, or a client from the exported `createClient`, `createCluster`, or `createSentinel`. `createClient` takes an options object, as in `createClient({ url: 'redis://localhost:6379' })`, not a string.
- Options: `namespace`, `keyPrefixSeparator` (default `::`), `clearBatchSize`, `useUnlink`, `noNamespaceAffectsAll`, `throwOnConnectError`, `throwOnErrors`, `connectionTimeout`. `throwOnErrors` here is the adapter's own option: keep it. Only the Keyv option of that name was removed.
- The namespace defaults to `undefined`. With no namespace, `clear()` deletes every string key without the separator in its name.
- A failure is reported once: when the adapter rejects, it no longer also emits `error`.
- CommonJS: `const KeyvRedis = require('@keyv/redis').default`. There is no named `KeyvRedis` export.
- `createKeyv(connect, options)` and `createKeyvNonBlocking(connect, options)` return a ready `Keyv`. They no longer set any Keyv error options.

## `@keyv/valkey`

- `useRedisSets` is now `useSets`, and it defaults to `false`. The old name still works as a deprecated getter and setter.
- The `redis` property is now `client`.
- Data keys are `namespace:<ns>:<key>`, or `sets:<ns>:<key>` with `useSets: true`. The set that tracks keys is `sets:<ns>` (v5: `namespace:<ns>`).
- Missing values are `undefined`, never `null`.
- `keyv` is now a peer dependency; install it next to the adapter.

## `@keyv/sqlite`

- The driver changed. v6 uses `node:sqlite` on Node.js and `bun:sqlite` on Bun, and falls back to `better-sqlite3`. It no longer uses `sqlite3`. To keep `sqlite3`, pass `createSqlite3Driver(sqlite3)` as the driver; otherwise remove the `sqlite3` dependency.
- A v4 or v5 table converts on the first connect. It is one-way, so back up first; see [stored-data.md](stored-data.md#sqlite-keyvsqlite).
- `keySize` still works. `keyLength` is a deprecated alias of it here, the reverse of PostgreSQL and MySQL.
- A deprecated `opts` getter remains for backward compatibility.
- New: an `expires` column, `clearExpired()`, the `clearExpiredInterval` option, bulk operations, and `createKeyv()`.

## `@keyv/postgres`

- `keySize` is now `keyLength`, and `dialect` is gone. In JavaScript, an old `keySize` is passed to the `pg` pool and has no effect.
- Namespaces live in a `namespace` column. Old tables need the migration script; see [stored-data.md](stored-data.md#postgresql-and-mysql).
- Native TTL with an `expires` column.

## `@keyv/mysql`

- `keySize` is now `keyLength`.
- The primary key is now `(namespace, id)`, and the key column is `VARBINARY`. Old tables need the migration script; see [stored-data.md](stored-data.md#postgresql-and-mysql).
- `keyv` is now a peer dependency; install it next to the adapter.

## `@keyv/mongo`

- The version jumps from 3.x to 6.x with the rest of the family.
- Uses MongoDB driver v7.
- Namespaces live in a `namespace` field (`metadata.namespace` with GridFS), and the unique index is `{ key: 1, namespace: 1 }`. Old documents need the migration script; see [stored-data.md](stored-data.md#mongodb-keyvmongo).
- `useGridFS` can only be set in the constructor. `ttlSupport` was removed. Options are strictly typed, so unknown options are TypeScript errors.
- New: `createKeyv`, `setMany`, `hasMany`, `clearExpired`, `clearUnusedFor`.

## `@keyv/memcache`

- Uses the `memcache` client instead of `memjs`. `store.client` is a `Memcache` instance, and options extend `MemcacheOptions`. Update any `memjs`-specific options.
- Credentials move out of the server string: `new KeyvMemcache('localhost:11211', { sasl: { username, password } })`.
- Values are handled as strings, not Buffers. `disconnect()` was added.
- `clear()` flushes the whole server, as before.

## `@keyv/etcd`

- The `etcd3` dependency is gone. The adapter talks to etcd's HTTP/JSON gateway, so it needs etcd 3.4 or later with the gateway on (the default).
- The `lease` property was removed. The store `ttl` option now applies to each key from its own write. In v5 it created one lease at startup that expired every key at once, after which writes failed.
- `ttlSupport` and `opts` were removed. `store.client` is the adapter's own `EtcdClient`.

## `@keyv/dynamo`

- Keys written without a TTL no longer get a six-hour expiry. To keep one, set Keyv's `ttl` option: `new Keyv(store, { ttl: 6 * 60 * 60 * 1000 })`.
- `sixHoursInMilliseconds` was removed. Keys written by v5 keep the expiry they were written with.
- `ttlSupport` and `opts` were removed.

## `@keyv/bigmap`

- Emits Hookified events (`BigMapEvents`). The `MapInterfacee` type is now `MapInterface`.
- `set()` returns the BigMap, like `Map`.
- The default `storeSize` changed, and a custom hash function now receives the real `storeSize`. Check any code that depends on how keys are distributed.
- No default export: `import { BigMap, createKeyv } from '@keyv/bigmap'`.

## Compression: `@keyv/compress-gzip`, `@keyv/compress-brotli`, `@keyv/compress-lz4`

- Each adapter implements `compress(value: string): Promise<string>` and `decompress(value: string): Promise<string>` and returns base64. The v5 `serialize`, `deserialize`, and `opts` members, and per-call options, are gone.
- Gzip uses pako v3; constructor options are pako options.
- Brotli dropped the `compress-brotli` package for `node:zlib`. Options are `{ compressOptions, decompressOptions }`; `enable`, `serialize`, `deserialize`, and `iltorb` are gone.
- LZ4 still takes an optional dictionary string.
- v6 can't read entries that v4 or v5 compressed; see [stored-data.md](stored-data.md#compressed-data).

## New packages

- Serializers: `@keyv/serialize-superjson` (`superJsonSerializer`) and `@keyv/serialize-msgpackr` (`msgpackrSerializer`). Pass one as `serialization`.
- Encryption: `@keyv/encrypt-node` (`KeyvEncryptNode`) and `@keyv/encrypt-web` (`KeyvEncryptWeb`). Pass one as `encryption`.
- Storage: `@keyv/cloudflare-kv` (`KeyvCloudflareKV`).

## Calling an adapter directly

Code that calls an adapter's methods without going through Keyv must pass an absolute Unix timestamp in milliseconds as `expires`, not a relative `ttl`. Passing `5000` means five seconds after 1970, so the entry is already expired.

```js
// v5
await store.set('foo', 'bar', 5000);
await store.setMany([{ key: 'a', value: '1', ttl: 5000 }]);

// v6
await store.set('foo', 'bar', Date.now() + 5000);
await store.setMany([{ key: 'a', value: '1', expires: Date.now() + 5000 }]);
```

Keyv's own `set(key, value, ttl)` still takes a relative TTL.
