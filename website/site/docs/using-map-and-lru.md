---
title: Using Map and LRU
order: 10
description: Use Map, quick-lru, lru.min, or BigMap as the Keyv store. How KeyvMemoryAdapter wraps them.
---

# Using Map and LRU

Any object that looks like a `Map` — `get`, `set`, `delete`, `clear`, `has` as **synchronous** methods — is wrapped in `KeyvMemoryAdapter`. That is the default when you call `new Keyv()` with no store.

```js
import Keyv from "keyv";

const keyv = new Keyv(); // KeyvMemoryAdapter(new Map())
await keyv.set("foo", "bar");
```

## Pass a `Map` yourself

```js
const store = new Map();
const keyv = new Keyv({ store });
```

You rarely need `new KeyvMemoryAdapter(...)` yourself. Keyv does it when it detects `store: "mapLike"`. Put `namespace` on the **Keyv** options; Keyv overwrites any namespace set on the adapter.

```js
import Keyv, { KeyvMemoryAdapter } from "keyv";

const keyv = new Keyv({
	store: new KeyvMemoryAdapter(new Map()),
	namespace: "cache",
});
```

## LRU caches

[`quick-lru`](https://github.com/sindresorhus/quick-lru) and [`lru.min`](https://github.com/wellwelwel/lru.min) implement the Map API. Use them to bound memory.

```js
import Keyv from "keyv";
import QuickLRU from "quick-lru";

const lru = new QuickLRU({ maxSize: 1000 });
const keyv = new Keyv({ store: lru });
```

When the underlying store's `set` accepts a TTL argument, the memory adapter also passes a **relative** duration derived from the absolute `expires`, so the LRU can evict on its own as well as via Keyv's expiry check.

## What `KeyvMemoryAdapter` adds

- **Namespace prefixing** — `namespace` + `keySeparator` (default `:`). Namespaced `clear()` only deletes that prefix when the store has `keys()`.
- **TTL** — keeps `{ value, expires }` beside the payload so `get` / `has` / `iterator` can evict lazily without decoding.
- **Batch + iterator** — `getMany`, `setMany`, `hasMany`, `deleteMany`, and `iterator()` when the store has `entries()`.
- **v6 contract** — `capabilities.expires === true`, so Keyv passes absolute `expires` directly.

This wrapper is separate from the `{ value, expires }` envelope Keyv core serializes. Custom serializers still see `expires` inside the payload.

## Scaling past Map limits

JavaScript `Map` is practical up to about **16.7 million** entries. [`@keyv/bigmap`](/docs/storage-adapters/bigmap/) distributes keys across many inner Maps.

```js
import { createKeyv } from "@keyv/bigmap";

const keyv = createKeyv();
await keyv.set("user:1", { name: "Ada" }, 60_000);
```

## Async Map-like stores

If `get` / `set` / `delete` / `clear` are **async**, Keyv uses `KeyvBridgeAdapter` instead of the memory adapter. The bridge converts absolute `expires` back to a relative `ttl` for `set(key, value, ttl)`. A Promise-wrapped `Map` that ignores that third argument will not evict by itself — enable `checkExpired` (default) so reads still filter expired rows. See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).
