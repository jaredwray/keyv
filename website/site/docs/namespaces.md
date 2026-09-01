---
title: Namespaces
order: 7
description: Isolate keys that share a backend. Namespace lives on the storage adapter in v6.
---

# Namespaces

A namespace isolates one Keyv instance's keys from another when they share a backend. Clearing `users` does not touch `cache`.

```js
import Keyv from "keyv";
import KeyvRedis from "@keyv/redis";

const redis = "redis://localhost:6379";
const users = new Keyv(new KeyvRedis(redis), { namespace: "users" });
const cache = new Keyv(new KeyvRedis(redis), { namespace: "cache" });

await users.set("foo", "users");
await cache.set("foo", "cache");
await users.get("foo"); // 'users'
await cache.get("foo"); // 'cache'

await users.clear();
await users.get("foo"); // undefined
await cache.get("foo"); // 'cache'
```

## How it works in v6

Keyv core does **not** prefix keys itself. It sets `store.namespace`. Official adapters apply that namespace with their own prefixing (Redis `namespace:key`, SQL `WHERE namespace = …`, and so on).

That is why `useKeyPrefix` / `keyPrefix` from v5 are gone. See the [v5 → v6 Migration](/docs/migration/v5-to-v6/) guide.

Set or clear the namespace later via the property:

```js
keyv.namespace = "tenant-42";
keyv.namespace = undefined; // no isolation
```

If [sanitization](/docs/sanitization/) is enabled, the namespace is cleaned on construct and on the setter.

## Memory and Map stores

`KeyvMemoryAdapter` (the default `Map` / LRU wrapper) prefixes keys as `namespace:key` (customizable `keySeparator`). A namespaced `clear()` removes only those keys **when the underlying store exposes `keys()`** (a standard `Map` does). A minimal Map-like object without `keys()` falls back to wiping the **entire** store — do not share that kind of store across namespaces.

## Bridge / legacy adapters

`KeyvBridgeAdapter` does one of two things:

- If the wrapped store already has a `namespace` property (a full adapter), the bridge **propagates** namespace and does not prefix again.
- Otherwise it prefixes keys itself so one shared async store can host multiple namespaces.

See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).

## Embedding Keyv in a library

Always set a namespace when you wrap Keyv inside another module so callers can `.clear()` without destroying unrelated app data.

```js
class AwesomeModule {
	constructor(opts) {
		this.cache = new Keyv({
			store: typeof opts.cache === "string" ? undefined : opts.cache,
			namespace: "awesome-module",
		});
	}
}
```
