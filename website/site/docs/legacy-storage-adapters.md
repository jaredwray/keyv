---
title: Legacy Storage Adapters
order: 14
description: How KeyvBridgeAdapter wraps v5 relative-TTL adapters and async Map-like stores.
---

# Legacy Storage Adapters

v6 storage adapters accept an **absolute** `expires` timestamp (Unix ms) on `set` / `setMany`. Pre-v6 adapters took a **relative** `ttl`. You do not need to rewrite those adapters: Keyv wraps them in `KeyvBridgeAdapter`.

The public API is unchanged. `keyv.set(key, value, ttl)` is still relative milliseconds.

## When the bridge is used

Keyv looks at the store in this order:

1. `store.capabilities.expires === true` → use the adapter as-is (v6 contract).
2. Full async adapter **without** that flag → `KeyvBridgeAdapter` (legacy relative TTL).
3. Sync Map-like → `KeyvMemoryAdapter`.
4. Async Map-like → `KeyvBridgeAdapter`.
5. Anything else → `'error'` and fall back to `KeyvMemoryAdapter(new Map())`.

```js
import Keyv, { KeyvBridgeAdapter } from "keyv";

const keyv = new Keyv({ store: myLegacyAdapter });
// equivalent to:
const explicit = new Keyv({
	store: new KeyvBridgeAdapter(myAsyncStore),
	namespace: "cache",
});
```

Put `namespace` on the Keyv options. Keyv overwrites namespace on the adapter.

## What the bridge does

- **Converts expiry** — absolute `expires` → relative `ttl` for the wrapped `set`. If the deadline is already past, it **deletes** instead of writing.
- **Delegates batch methods** — `getMany`, `setMany`, `has`, `hasMany`, `deleteMany`, `iterator`, `disconnect` when present; otherwise loops over single-key methods.
- **Namespaces** — if the store has a `namespace` property, the bridge assigns it and does not prefix keys (avoids double-prefixing). Otherwise the bridge prefixes `namespace:key`.
- **Forwards `'error'`** from the wrapped store onto the bridge (and then onto Keyv).

## Writing a v6 adapter instead

Prefer declaring the new contract so you skip the conversion and never parse encoded values to recover TTL (that used to fail under compression, encryption, or non-JSON serializers):

```ts
import { keyvStorageCapability, type KeyvStorageEntry } from "keyv";

class MyAdapter {
	get capabilities() {
		return keyvStorageCapability(this);
	}

	async set(key, value, expires) {
		// expires is Unix ms, or undefined
	}

	async setMany(entries: KeyvStorageEntry[]) {
		// each entry has absolute expires
	}
}
```

See [Storage Adapters](/docs/storage-adapters/overview/) and [Detect Capabilities](/docs/detect-capabilities/).

## Third-party adapters

Community adapters that have not declared `capabilities.expires` keep working through the bridge. You can still pass `{ store: communityAdapter }`. When you maintain an adapter, upgrading to the v6 contract is recommended.

The [third-party list](/docs/storage-adapters/third-party/) has community backends and a walkthrough for implementing `KeyvStorageAdapter`.
