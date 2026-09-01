---
title: Detect Capabilities
order: 13
description: detectKeyv, detectKeyvStorage, compression, serialization, encryption, and keyvStorageCapability.
---

# Detect Capabilities

Keyv exports helpers that inspect an object and report which methods exist, whether they are sync or async, and whether the object is a compatible Keyv instance, store, compressor, serializer, or encryptor.

```ts
import {
	detectKeyv,
	detectKeyvStorage,
	detectKeyvCompression,
	detectKeyvSerialization,
	detectKeyvEncryption,
	keyvStorageCapability,
} from "keyv";
```

Every `methods` entry is `{ exists: boolean, methodType: "sync" | "async" | "none" }`.

## `detectKeyv(obj)`

Returns `{ compatible, methods, properties }`. `compatible` is `true` only when **all** Keyv methods and the `hooks` / `stats` properties are present.

```js
const result = detectKeyv(new Keyv());
result.compatible; // true
result.methods.get.methodType; // 'async'
result.properties.hooks; // true
result.properties.stats; // true

const partial = detectKeyv(new Map());
partial.compatible; // false
partial.methods.get.exists; // true
```

Methods checked: `get`, `set`, `delete`, `clear`, `has`, `getMany`, `setMany`, `deleteMany`, `hasMany`, `disconnect`, `getRaw`, `getManyRaw`, `setRaw`, `setManyRaw`, `iterator`.

## `detectKeyvStorage(obj)`

Returns `{ compatible, store, methods, expires? }`.

`store` is one of:

| Value | Meaning |
| --- | --- |
| `"keyvStorage"` | Full async adapter (`get`, `set`, `delete`, `clear`, `has`, `setMany`, `deleteMany`, `hasMany`) |
| `"mapLike"` | Sync `get`, `set`, `delete`, `has` (a `Map`) |
| `"asyncMap"` | Async `get`, `set`, `delete`, `clear` |
| `"none"` | Not a usable store |

```js
detectKeyvStorage(new Map());
// { compatible: true, store: 'mapLike', methods: { get: { exists: true, methodType: 'sync' }, ... } }
```

Keyv uses this in `resolveStore()` to pick `KeyvMemoryAdapter` vs `KeyvBridgeAdapter`.

## `keyvStorageCapability(adapter)`

Build the full capability object for a v6 adapter, including `expires: true`. Expose it as a `capabilities` getter so Keyv passes **absolute** `expires` instead of wrapping you in the bridge.

```ts
import { keyvStorageCapability, type KeyvStorageAdapter } from "keyv";

class MyAdapter {
	get capabilities() {
		return keyvStorageCapability(this);
	}

	async set(key, value, expires) {
		/* expires is Unix ms */
	}
}
```

Declaring `expires: true` means you should enforce expiry (native TTL and/or a read-side check). Keyv still double-checks on read when `checkExpired` is `true`. Validate with `@keyv/test-suite` `storageTtlTests`.

## Compression, serialization, encryption

```js
detectKeyvCompression({ compress: (d) => d, decompress: (d) => d });
// { compatible: true, methods: { compress, decompress } }

detectKeyvSerialization(JSON);
// { compatible: true, methods: { stringify, parse } }

detectKeyvEncryption({ encrypt: (d) => d, decrypt: (d) => d });
// { compatible: true, methods: { encrypt, decrypt } }
```

`compatible` is `true` when both methods in the pair exist.

These replaced the v5-era `isKeyv` / `isKeyvStorage` helpers. See the [v5 → v6 Migration](/docs/migration/v5-to-v6/) guide.
