---
title: Getting Started
order: 1
description: Install Keyv, store a value in seconds, and learn who uses it and what it can do.
---

# Getting Started

Keyv is a small, Promise-based key-value store. Use it as an in-memory TTL cache or point it at Redis, SQLite, Postgres, MongoDB, and other backends through storage adapters. The application API stays the same when you change the store.

```js
import Keyv from "keyv";

const keyv = new Keyv();
await keyv.set("user:1", { name: "Ada" }, 60_000);
await keyv.get("user:1"); // { name: 'Ada' }
```

Keys are strings. Values can be any JSON-serializable type, plus `Buffer` and `BigInt` with the built-in serializer.

## Quick Start

Install the core package. By default everything lives in memory.

```bash
npm install keyv
```

```js
import Keyv from "keyv";

const keyv = new Keyv();

await keyv.set("foo", "bar");
await keyv.get("foo"); // 'bar'
await keyv.has("foo"); // true
await keyv.delete("foo"); // true
```

Add a storage adapter when you want the data to survive process restarts:

```bash
npm install @keyv/redis
```

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const keyv = new Keyv(new KeyvRedis("redis://localhost:6379"));
keyv.on("error", (error) => console.error("Keyv error", error));

await keyv.set("session:abc", { userId: 42 }, 3_600_000);
```

You can also pass options as the first argument, or pass the adapter plus options:

```js
const keyv = new Keyv({
	store: new KeyvRedis("redis://localhost:6379"),
	namespace: "cache",
	ttl: 60_000,
});
```

See [Options](/docs/options/) for the full constructor surface, and [Storage Adapters](/docs/storage-adapters/overview/) for every official backend.

## Who Uses Keyv

Keyv is the storage layer behind several widely used caching stacks in the Node.js ecosystem:

| Project | How it uses Keyv |
| --- | --- |
| [Cacheable](https://cacheable.org) | Layered L1/L2 caching built on Keyv stores |
| [cache-manager](https://www.npmjs.com/package/cache-manager) | Multi-store cache abstraction for services |
| [NestJS](https://docs.nestjs.com/techniques/caching) | Caching via `@nestjs/cache-manager` |
| **got / cacheable-request** | RFC-compliant HTTP response caching |

Thousands of npm packages depend on Keyv directly or through those libraries. If you are embedding Keyv inside your own module, expose a `cache` / `store` option and set a [namespace](/docs/namespaces/) so `.clear()` cannot wipe unrelated data.

## Features

### Storage adapters

Official adapters wrap Redis, Valkey, MongoDB, SQLite, PostgreSQL, MySQL, Etcd, Memcache, DynamoDB, and Cloudflare KV. Pass any of them as `store`. See [Storage Adapters](/docs/storage-adapters/overview/).

**Built-in adapters** ship in the `keyv` package:

- **`KeyvMemoryAdapter`** — the default. Wraps `Map`, [`quick-lru`](https://github.com/sindresorhus/quick-lru), [`lru.min`](https://github.com/wellwelwel/lru.min), or any Map-like object. Adds namespacing, TTL, and batch methods. See [Using Map and LRU](/docs/using-map-and-lru/).
- **`KeyvBridgeAdapter`** — wraps legacy async adapters and async Map-like stores so they work with the v6 contract. See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).

You can also bring [your own adapter](/docs/storage-adapters/overview/#build-your-own) or use a [third-party adapter](/docs/storage-adapters/third-party/).

### Serialization

The built-in `KeyvJsonSerializer` is on by default. It round-trips JSON types plus `Buffer` and `BigInt`. Official alternatives:

- [`@keyv/serialize-superjson`](/docs/serialization/superjson/) — `Date`, `Map`, `Set`, `RegExp`, `URL`, `Error`
- [`@keyv/serialize-msgpackr`](/docs/serialization/msgpackr/) — compact binary MessagePack

Disable serialization for in-memory objects with `{ serialization: false }`. Compression and encryption require a serializer. See [Encode and Decode](/docs/encode-and-decode/).

### Sanitization

Enable `{ sanitize: true }` to strip SQL comments, Mongo operators, path traversal, and control characters from keys and namespaces. Harmless characters such as quotes pass through. See [Sanitization](/docs/sanitization/).

### Encryption

Pass a `KeyvEncryptionAdapter` (`encrypt` / `decrypt`) via the `encryption` option. Official packages:

- [`@keyv/encrypt-node`](/docs/encryption/encrypt-node/) — Node.js `crypto` (AES-GCM, ChaCha20-Poly1305, …)
- [`@keyv/encrypt-web`](/docs/encryption/encrypt-web/) — Web Crypto API for browsers, Workers, and Deno

Encryption runs on the serialized (and optionally compressed) string. See [Encode and Decode](/docs/encode-and-decode/).

### Everything else

- **TTL** — default on the instance, override per `set()`
- **Namespaces** — isolate keys that share a backend
- **Hooks** — `before:*` / `after:*` on every operation
- **Events, stats, and telemetry** — `error` events, `stat:hit` / `stat:miss`, and optional `eventLogger`
- **Runtimes** — Node.js, Bun, and browsers

## Type-safe Usage

Pass a generic on the instance, or on individual `get` / `set` calls:

```ts
const numbers = new Keyv<number>();
await numbers.set("count", 3);
const value = await numbers.get("count"); // number | undefined

const keyv = new Keyv();
await keyv.set<string>("name", "Ada");
const name = await keyv.get<string>("name");
```

## Next Steps

- [Options](/docs/options/) and [Properties](/docs/properties/)
- [Methods](/docs/methods/)
- [Storage Adapters](/docs/storage-adapters/overview/)
- [v5 → v6 Migration](/docs/migration/v5-to-v6/) if you are upgrading
- Archived [v5 documentation](/v5/)
