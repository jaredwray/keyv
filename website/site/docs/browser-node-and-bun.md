---
title: Browser, Node, and Bun Support
order: 15
description: Runtime support for Node.js, Bun, and browsers. Engines, Web Crypto, and what to install where.
---

# Browser, Node, and Bun Support

## Node.js

The published `engines` field is **Node.js 22.19+** (the current maintenance LTS line and newer). Official adapters follow the same floor. That is a [versioning](/docs/migration/versioning/) contract: we do not raise the Node floor on an already-released major.

```bash
npm install keyv
```

Core Keyv has one runtime dependency: [hookified](https://hookified.org). The JSON serializer uses `Buffer` when present and `btoa` / `atob` otherwise.

Use [`@keyv/encrypt-node`](/docs/encryption/encrypt-node/) for `crypto` ciphers in Node.

## Bun

We test Keyv on [Bun](https://bun.sh/). The default target is still Node.js. If something breaks on Bun, [open an issue](https://github.com/jaredwray/keyv/issues).

SQLite's optional `bun:sqlite` driver is the fastest in the [SQLite benchmarks](/docs/storage-adapters/sqlite/#benchmarks) when you are already on Bun.

## Browsers

Keyv's core source does not import Node built-ins. The in-memory store, serializer, hooks, stats, sanitization, and Web Crypto encryption work in browsers (and Cloudflare Workers / Deno) after your bundler includes the package.

```js
import Keyv from "keyv";

const keyv = new Keyv({ store: new Map() });
await keyv.set("foo", "bar");
```

Use [`@keyv/encrypt-web`](/docs/encryption/encrypt-web/) for `crypto.subtle`. Use [`@keyv/cloudflare-kv`](/docs/storage-adapters/cloudflare-kv/) inside Workers (`bind` mode) or from Node via the REST API.

Browser storage (localStorage, IndexedDB) is available through [community adapters](/docs/storage-adapters/third-party/) such as `keyv-browser`.

> [!NOTE]
> Most official *database* adapters (Redis, Postgres, Mongo, …) expect a Node-like runtime and native clients. In the browser, stick to `Map` / LRU, BigMap, or a browser/Worker-safe adapter.

## Serialization in the browser

`KeyvJsonSerializer` round-trips `Uint8Array` via base64 without `Buffer`. SuperJSON and msgpackr work wherever their own packages run.

## Tests

- Node: `pnpm test` in the monorepo
- Bun: `.github/workflows/bun-test.yaml`
- Browser: static "no Node builtin imports" checks plus happy-dom runtime tests in `core/keyv`
