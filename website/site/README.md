Simple key-value storage with support for multiple backends.

Keyv is a tiny, Promise-based store that works as a TTL cache or a persistent key-value database. Swap Redis, SQLite, Postgres, MongoDB, and more without changing your application code.

## Quick Start

```bash
npm install keyv
```

```js
import Keyv from "keyv";

const keyv = new Keyv();
await keyv.set("foo", "bar");
await keyv.get("foo"); // 'bar'
```

Add a backend when you need persistence:

```bash
npm install @keyv/redis
```

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const keyv = new Keyv(new KeyvRedis("redis://localhost:6379"));
```

[Read the Getting Started guide](/docs/) for adapters, serialization, sanitization, encryption, and more.

## Who Uses Keyv

Keyv is the storage layer behind widely used caching stacks:

- **[Cacheable](https://cacheable.org)** — layered L1/L2 caching built on Keyv
- **[cache-manager](https://www.npmjs.com/package/cache-manager)** — the cache abstraction used across Node.js services
- **[NestJS](https://docs.nestjs.com/techniques/caching)** — via `@nestjs/cache-manager`
- **got / cacheable-request** — RFC-compliant HTTP caching

Thousands of npm packages depend on Keyv directly or through those libraries.

## Features

- **One API, many backends** — official adapters for Redis, Valkey, MongoDB, SQLite, PostgreSQL, MySQL, Etcd, Memcache, DynamoDB, and Cloudflare KV
- **Built-in Memory and Bridge adapters** — `Map` and LRU stores work out of the box; legacy async stores keep working
- **Serialization** — built-in JSON (`Buffer` + `BigInt`), plus SuperJSON and MessagePack
- **Sanitization** — strip SQL, Mongo, path-traversal, and control-character patterns from keys
- **Encryption** — Node.js crypto and Web Crypto adapters, or bring your own
- **TTL, namespaces, hooks, stats, and telemetry**
- **Node.js, Bun, and browsers**

## v5 Docs

The previous documentation site is archived at [keyv.org/v5](/v5/).
