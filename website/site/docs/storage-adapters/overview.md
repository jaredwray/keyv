---
title: Storage Adapters
sidebarTitle: Overview
parent: Storage Adapters
order: 1
description: Official backends, native TTL, how to use an adapter, benchmarks, and writing your own.
---

# Storage Adapters

Keyv is a thin API over a store. Performance is almost entirely the backend's; Keyv adds namespacing, encoding, TTL conversion, and a consistent Promise API.

## Official adapters

| Backend | Package | Native expiry | Notes |
| --- | --- | --- | --- |
| Memory / Map / LRU | built-in `KeyvMemoryAdapter` | Yes (lazy) | Default. See [Using Map and LRU](/docs/using-map-and-lru/) |
| Redis | [@keyv/redis](/docs/storage-adapters/redis/) | Yes (`PXAT`, `PX` fallback) | Clusters, Sentinel, TLS |
| Valkey | [@keyv/valkey](/docs/storage-adapters/valkey/) | Yes (`PXAT`) | Redis-compatible OSS |
| MongoDB | [@keyv/mongo](/docs/storage-adapters/mongo/) | TTL index (lazy sweep) | Revalidated in Keyv |
| SQLite | [@keyv/sqlite](/docs/storage-adapters/sqlite/) | `expires` column | Node, better-sqlite3, bun:sqlite |
| PostgreSQL | [@keyv/postgres](/docs/storage-adapters/postgres/) | `expires` column | |
| MySQL | [@keyv/mysql](/docs/storage-adapters/mysql/) | `expires` column | Interval sweeper |
| Etcd | [@keyv/etcd](/docs/storage-adapters/etcd/) | Leases | |
| Memcache | [@keyv/memcache](/docs/storage-adapters/memcache/) | Seconds (`exptime`) | Keyv `checkExpired` keeps ms precision |
| DynamoDB | [@keyv/dynamo](/docs/storage-adapters/dynamo/) | TTL attribute (hours lag) | |
| Cloudflare KV | [@keyv/cloudflare-kv](/docs/storage-adapters/cloudflare-kv/) | Client-side + 60s native min | Worker bind or REST |
| BigMap | [@keyv/bigmap](/docs/storage-adapters/bigmap/) | Via Keyv | Scale past ~16.7M Map entries |

Install the adapter next to `keyv` and pass an instance as `store` (or as the first constructor argument):

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const keyv = new Keyv(new KeyvRedis("redis://localhost:6379"), {
	namespace: "cache",
});
```

Many adapters also export `createKeyv(...)` so you can skip the two-step construct.

## How to use

1. Install `keyv` and the adapter package.
2. Construct the adapter (URI, native client, or options).
3. Pass it to `new Keyv(adapter)` or `{ store }`.
4. Listen for `'error'` on the Keyv instance.
5. Use `set` / `get` / `delete` as usual. TTL on `keyv.set` is **relative milliseconds**; Keyv converts to absolute `expires` for v6 adapters.

```js
keyv.on("error", (error) => console.error(error));
await keyv.set("foo", { n: 1 }, 60_000);
await keyv.get("foo");
```

Map-like stores do not need an extra package:

```js
import QuickLRU from "quick-lru";

const keyv = new Keyv({ store: new QuickLRU({ maxSize: 1000 }) });
```

## Benchmarks

Keyv itself is not the bottleneck. Compare **drivers and runtimes**, not Keyv vs Keyv.

**SQLite** (in-memory, 10k pre-generated pairs, `set` then `get`). From the [@keyv/sqlite](/docs/storage-adapters/sqlite/#benchmarks) suite — relative numbers, not a guarantee on your machine:

| Driver | Summary | ops/sec |
| --- | --- | --- |
| bun:sqlite | fastest in that run | ~64K |
| better-sqlite3 | ~32% slower | ~44K |
| node:sqlite | ~33% slower | ~43K |
| sqlite3 (legacy) | ~75% slower | ~16K |

**BigMap vs `Map`**: native `Map` is faster below the ~16.7 million entry limit. [@keyv/bigmap](/docs/storage-adapters/bigmap/) exists to go beyond that limit by hashing across inner Maps.

For Redis, Postgres, and the rest, measure your deployment (network RTT, pipeline, cluster). Use `getMany` / `setMany` when the adapter implements them natively.

## Build your own

Implement `KeyvStorageAdapter`. Required: async `get`, `set`, `delete`, `clear`. Optional but recommended: `has`, `getMany`, `setMany`, `deleteMany`, `hasMany`, `iterator`, `disconnect`.

v6 `set` takes **absolute** `expires` (Unix ms). Declare it:

```ts
import { keyvStorageCapability, type KeyvStorageEntry } from "keyv";

class MyAdapter {
	get capabilities() {
		return keyvStorageCapability(this);
	}

	async set(key, value, expires) {
		/* persist value + expires */
		return true;
	}

	async setMany(entries: KeyvStorageEntry[]) {
		/* ... */
	}
}
```

If you omit `capabilities.expires`, Keyv wraps you in `KeyvBridgeAdapter` and converts `expires` back to relative `ttl`. See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).

Test with [@keyv/test-suite](/docs/test-suite/):

```js
import { describe } from "vitest";
import keyvTestSuite from "@keyv/test-suite";
import Keyv from "keyv";
import MyAdapter from "./my-adapter.js";

keyvTestSuite(describe, Keyv, () => new MyAdapter());
```

Community adapters are listed on [Third-Party Adapters](/docs/storage-adapters/third-party/).
