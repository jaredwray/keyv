---
title: Options
order: 2
description: Constructor options for Keyv — store, namespace, TTL, serialization, compression, encryption, stats, and more.
---

# Options

Create a Keyv instance with `new Keyv(store?, options?)` or `new Keyv(options)`.

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const keyv = new Keyv(new KeyvRedis("redis://localhost:6379"), {
	namespace: "cache",
	ttl: 60_000,
});
```

The first argument can be a storage adapter **or** an options object. Extra fields you pass are not forwarded into the adapter — configure the adapter itself, then pass the instance as `store`.

## `store`

Type: `KeyvStorageAdapter | Map | Map-like`  
Default: in-memory `Map` wrapped by `KeyvMemoryAdapter`

The storage backend. Official adapters, a `Map`, an LRU, or any object Keyv can detect. See [Storage Adapters](/docs/storage-adapters/overview/) and [Using Map and LRU](/docs/using-map-and-lru/).

```js
const keyv = new Keyv({ store: new Map() });
```

If the value is not a usable store, Keyv emits an `error` and falls back to `KeyvMemoryAdapter` with a `Map`.

## `namespace`

Type: `string`  
Default: `undefined`

Namespace for this instance. Keyv assigns it on the storage adapter so keys from different instances can share a backend. See [Namespaces](/docs/namespaces/).

## `ttl`

Type: `number` (milliseconds)  
Default: `undefined` (no expiry)

Default time-to-live for `set()`. A per-call `ttl` overrides this. `0` and negative values are treated as no TTL.

## `serialization`

Type: `KeyvSerializationAdapter | false`  
Default: `KeyvJsonSerializer` (built-in)

Object with `stringify` and `parse`. Set to `false` to store raw objects (in-memory only; compression and encryption are skipped). See [Encode and Decode](/docs/encode-and-decode/).

```js
import { superJsonSerializer } from "@keyv/serialize-superjson";

const keyv = new Keyv({ serialization: superJsonSerializer });
```

## `compression`

Type: `KeyvCompressionAdapter`  
Default: `undefined`

Adapter with `compress` and `decompress`. Requires serialization (the default is enough). See [Compression](/docs/compression/overview/).

```js
import KeyvGzip from "@keyv/compress-gzip";

const keyv = new Keyv({ compression: new KeyvGzip() });
```

## `encryption`

Type: `KeyvEncryptionAdapter`  
Default: `undefined`

Adapter with `encrypt` and `decrypt`. Runs after serialize (and optional compress). See [Encryption](/docs/encryption/overview/).

```js
import KeyvEncryptNode from "@keyv/encrypt-node";

const keyv = new Keyv({
	encryption: new KeyvEncryptNode({ key: process.env.KEYV_SECRET }),
});
```

## `sanitize`

Type: `KeyvSanitizeOptions`

Default: disabled

Strip dangerous patterns from keys and namespaces. Set `keys` and `namespace` to `true` to enable every category on both targets. See [Sanitization](/docs/sanitization/).

```js
const keyv = new Keyv({
	sanitize: { keys: { sql: true, mongo: false }, namespace: true },
});
```

## `stats`

Type: `boolean`  
Default: `false`

Subscribe `KeyvStats` to telemetry events (`stat:hit`, `stat:miss`, `stat:set`, `stat:delete`, `stat:error`). See [Statistics](/docs/statistics/).

```js
const keyv = new Keyv({ stats: true });
```

## `throwOnErrors`

Type: `boolean`  
Default: `false`

Maps to Hookified's `throwOnEmitError`. In the current runtime, this flag is only evaluated for an `'error'` event with no listeners. Because `throwOnEmptyListeners` is enabled by default, unhandled errors already throw; a registered listener prevents the throw even when `throwOnErrors` is `true`. See [Events and Errors](/docs/events-and-errors/).

## `checkExpired`

Type: `boolean`  
Default: `true`

When `true`, Keyv also checks the absolute `expires` in the stored envelope on `get` / `getMany` / `has` / `hasMany`, and deletes expired rows it finds. That keeps reads millisecond-precise on backends whose native TTL is coarse (Memcached seconds) or lazily swept (DynamoDB, Mongo TTL indexes).

Set `false` to trust the adapter alone and skip the extra decode on reads.

```js
const keyv = new Keyv({ checkExpired: false });
```

## Constructor overloads

```ts
new Keyv();
new Keyv(options);
new Keyv(store);
new Keyv(store, options);
```

`store` is detected by looking for a `.get` method. Anything else is treated as `options`.
