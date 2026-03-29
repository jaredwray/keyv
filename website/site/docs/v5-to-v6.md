---
title: 'v5 to v6 Migration'
order: 3
---

# Keyv v6 (In Progress)

We are pleased to announce Keyv v6 with major enhancements and some breaking changes. This guide will help you understand how to migrate from v5 to v6. For most users, the transition will be straightforward.

**Important:** With the release of v6, Keyv v5 will move to maintenance mode. This means v5 will only receive security fixes and minor maintenance updates. We encourage all users to migrate to v6 to take advantage of the latest features and improvements. You can view the `v5` branch in the the mono repo.

## Table of Contents

- [Roadmap & Progress](#roadmap--progress)
- [Quick Migration Guide](#quick-migration-guide)
- [Breaking Changes](#breaking-changes)
  - [Namespace Overhaul](#namespace-overhaul)
  - [`opts` Property Removed](#opts-property-removed)
  - [Serialization Replaces `stringify` and `parse`](#serialization-replaces-stringify-and-parse)
  - [Hookified for Events and Hooks](#hookified-for-events-and-hooks)
  - [`deleteMany` Returns `boolean[]`](#deletemany-returns-boolean)
  - [`setMany` Uses `KeyvEntry[]` and Returns `boolean[]`](#setmany-uses-keyventry-and-returns-boolean)
  - [`get` and `getMany` No Longer Support Raw](#get-and-getmany-no-longer-support-raw)
  - [Iterator Changes](#iterator-changes)
  - [Removed `.ttlSupport` from Storage Adapters](#removed-ttlsupport-from-storage-adapters)
  - [Returns `undefined` Instead of `null`](#returns-undefined-instead-of-null)
  - [Compression Adapter Interface Change](#compression-adapter-interface-change)
  - [`@keyv/memcache` Moves from `memjs` to `memcache`](#keyvmemcache-moves-from-memjs-to-memcache)
- [New Features](#new-features)
  - [Keyv v6 Versioning](#keyv-v6-versioning)
  - [Keyv v5 Maintenance Mode](#keyv-v5-maintenance-mode)
  - [Browser Compatibility](#browser-compatibility)
  - [Serialization Adapters](#serialization-adapters)
  - [Encryption Adapters](#encryption-adapters)
  - [New Identification Functions](#new-identification-functions)
  - [Memory Adapter](#memory-adapter)

---

## Roadmap & Progress

| Task | Status |
|------|--------|
| Remove `opts` property in Keyv and Storage Adapters | IN PROGRESS |
| Add encryption adapters | NOT STARTED |
| Browser compatibility | NOT STARTED |
| Stats System to be Event Driven | NOT STARTED |
| Test Suite Overhaul | NOT STARTED |
| Refactor iterator implementation | COMPLETED |
| Update `deleteMany` return type | COMPLETED |
| Update `setMany` signature and return type | COMPLETED |
| Add compression interface standardization | COMPLETED |
| Integrate Hookified library in Keyv | COMPLETE |
| Keyv core does not do keyPrefixing | COMPLETED |
| Update `@keyv/sqlite`  | COMPLETE |
| Update `@keyv/dynamo`  | COMPLETE |
| Update `@keyv/etcd`  | COMPLETE |
| Update `@keyv/valkey`  | COMPLETE |
| Finalize namespace handling in storage adapters | COMPLETE |
| Add `getRaw` and `getManyRaw` methods | COMPLETE |
| Implement `KeyvMemoryAdapter` | COMPLETE |
| Add serialization adapters | COMPLETE |
| Migrate `@keyv/memcache` from `memjs` to `memcache` | COMPLETE |
| Update `@keyv/bigmap`  | COMPLETE |
| Update `@keyv/mongo`  | COMPLETE |
| Update `@keyv/mysql`  | COMPLETE |
| Update `@keyv/postgres`  | COMPLETE |
| Update `@keyv/redis`  | COMPLETE |
| Add GitHub Actions release workflow | COMPLETE |

---

## Quick Migration Guide

For most users, migrating from v5 to v6 involves a few key changes:

1. **Update property access** - The `opts` property has been removed. Use direct property access instead (`keyv.namespace` instead of the old `keyv.opts.namespace`)

2. **Update serialization** - Replace `serialize`/`deserialize` options with the new `serialization` adapter:
   ```javascript
   // v5
   const keyv = new Keyv({ serialize: JSON.stringify, deserialize: JSON.parse });

   // v6
   import KeyvSerialize from '@keyv/serialize';
   const keyv = new Keyv({ serialization: new KeyvSerialize() });
   ```

3. **Update raw value access** - Replace `get(key, { raw: true })` with `getRaw(key)` and `getMany(keys, { raw: true })` with `getManyRaw(keys)`

4. **Handle new return types** - `deleteMany` and `setMany` now return `boolean[]` instead of a single `boolean`

For detailed information on each change, see the sections below.

---

## Breaking Changes

### Namespace Overhaul

We have finalized the transition (started in v5) to move all namespace handling to the storage adapters themselves. When you set the namespace on Keyv, it passes it directly to the storage adapter.

**What changed:**
- `useKeyPrefix` property has been removed
- `keyPrefix` property has been removed
- Key prefixing is no longer done at the Keyv layer

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv({
  namespace: 'myapp',
  useKeyPrefix: true,
  keyPrefix: 'prefix:'
});
```

**v6 (after):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv({ namespace: 'myapp' });
// Namespace is handled directly by the storage adapter
```

For legacy storage adapters or `Map`-compatible stores, we have added `KeyvMemoryAdapter` which handles advanced features without overloading the main Keyv codebase. See [Memory Adapter](#memory-adapter) for more details.

---

### `opts` Property Removed

In Keyv v5, we began removing `opts` as a passed-around value. In v6, `opts` has been fully removed from the `KeyvStorageAdapter` interface and all storage adapters. The `dialect` property has also been removed. All properties are now directly part of the Keyv class and each storage adapter.

**v5 (before):**
```javascript
const keyv = new Keyv();
console.log(keyv.opts.namespace);
```

**v6 (after):**
```javascript
const keyv = new Keyv();
console.log(keyv.namespace);
```

---

### Serialization Replaces `stringify` and `parse`

The `stringify` and `parse` options have been replaced with the new `serialization` property that accepts a serialization adapter.

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv({
  serialize: JSON.stringify,
  deserialize: JSON.parse
});
```

**v6 (after):**
```javascript
import Keyv from 'keyv';
import KeyvSerialize from '@keyv/serialize';

const keyv = new Keyv({ serialization: new KeyvSerialize() });
```

See [Serialization Adapters](#serialization-adapters) for more details.

---

### Hookified for Events and Hooks

Keyv now extends [Hookified](https://hookified.org) directly, replacing the custom `EventManager` and `HooksManager` classes. This unifies the event/hook system across Keyv and all storage adapters.

**Breaking Changes:**
- `keyv.hooks.addHandler(event, fn)` is replaced by `keyv.addHook(event, fn)`
- `keyv.hooks.removeHandler(event, fn)` is replaced by `keyv.removeHook({ event, handler: fn })`
- `keyv.hooks.handlers` is replaced by `keyv.hooks` (a `Map<string, IHook[]>`)
- Hook names changed from `pre`/`post` to `before:`/`after:` convention
- The `emitErrors` option has been removed
- `throwOnErrors` behavior changed: it now only throws when there are **no** error listeners registered (standard EventEmitter pattern). In v5, it would always re-throw after emitting.

**Hook Name Migration:**

| v5 Hook | v6 Hook |
|---------|---------|
| `KeyvHooks.PRE_SET` (`"preSet"`) | `KeyvHooks.BEFORE_SET` (`"before:set"`) |
| `KeyvHooks.POST_SET` (`"postSet"`) | `KeyvHooks.AFTER_SET` (`"after:set"`) |
| `KeyvHooks.PRE_GET` (`"preGet"`) | `KeyvHooks.BEFORE_GET` (`"before:get"`) |
| `KeyvHooks.POST_GET` (`"postGet"`) | `KeyvHooks.AFTER_GET` (`"after:get"`) |
| `KeyvHooks.PRE_DELETE` (`"preDelete"`) | `KeyvHooks.BEFORE_DELETE` (`"before:delete"`) |
| `KeyvHooks.POST_DELETE` (`"postDelete"`) | `KeyvHooks.AFTER_DELETE` (`"after:delete"`) |

The same pattern applies for `GET_MANY`, `GET_RAW`, `GET_MANY_RAW`, `SET_RAW`, `SET_MANY_RAW` hooks.

The old `PRE_`/`POST_` enum values are deprecated but still work. Keyv will emit deprecation warnings when they are used.

**v5 (before):**
```javascript
import Keyv, { KeyvHooks } from 'keyv';

const keyv = new Keyv();
keyv.hooks.addHandler(KeyvHooks.PRE_SET, (data) => {
  console.log(`Setting ${data.key}`);
});
```

**v6 (after):**
```javascript
import Keyv, { KeyvHooks } from 'keyv';

const keyv = new Keyv();
keyv.addHook(KeyvHooks.BEFORE_SET, (data) => {
  console.log(`Setting ${data.key}`);
});
```

**Events:**
Events work the same as before, but now use Hookified internally:

```javascript
import Keyv from 'keyv';

const keyv = new Keyv();

keyv.on('error', (err) => {
  console.error('Keyv error:', err);
});

keyv.on('disconnect', () => {
  console.log('Disconnected');
});
```

**Error Handling:**
The `throwOnErrors` option still works and defaults to `false`. When enabled, errors will throw if there are **no** error listeners registered (via hookified's `throwOnEmitError`). If you have an error listener, the error is passed to the listener instead of being thrown. This follows the standard Node.js EventEmitter pattern.

```javascript
const keyv = new Keyv({ throwOnErrors: true });

// Error will throw because there is no error listener
await keyv.get('key'); // throws if the store errors

// Error will NOT throw because there is a listener handling it
keyv.on('error', (err) => console.error(err));
await keyv.get('key'); // error passed to listener instead
```

Additionally, `throwOnEmptyListeners` is now enabled by default. This means that if an error event is emitted with **no** error listeners registered, it will always throw — even without `throwOnErrors` enabled. This is the standard Node.js EventEmitter behavior for unhandled errors. To silently discard errors, register a no-op listener:

```javascript
keyv.on('error', () => {});
```

For more about Hookified, visit [https://hookified.org](https://hookified.org).

---

### `deleteMany` Returns `boolean[]`

`deleteMany` now returns a `boolean[]` indicating the success of each deletion. The `StorageAdapter` interface has been updated accordingly.

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

const result = await keyv.deleteMany(['key1', 'key2']);
// result was: boolean (true if all deleted)
```

**v6 (after):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

const results = await keyv.deleteMany(['key1', 'key2']);
// results: [true, true] - boolean for each key
console.log(results[0]); // true - key1 was deleted
console.log(results[1]); // true - key2 was deleted
```

---

### `setMany` Uses `KeyvEntry[]` and Returns `boolean[]`

`setMany` now uses the `KeyvEntry[]` type for input and returns `boolean[]` to indicate success for each entry.

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2' }
]);
```

**v6 (after):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();

// Using KeyvEntry[] type
const entries = [
  { key: 'key1', value: 'value1', ttl: 1000 },
  { key: 'key2', value: 'value2' }
];

const results = await keyv.setMany(entries);
// results: [true, true] - boolean for each entry
console.log(results[0]); // true - key1 was set
console.log(results[1]); // true - key2 was set
```

---

### `get` and `getMany` No Longer Support Raw

Since Keyv v5.5, we added `getRaw` and `getManyRaw` methods. In v6, raw support has been removed from `get` and `getMany`.

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key', 'value', 1000);

const value = await keyv.get('key');
const rawValue = await keyv.get('key', { raw: true });
// rawValue: { value: 'value', expires: 1234567890 }
```

**v6 (after):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key', 'value', 1000);

// Use get for the value
const value = await keyv.get('key');
// value: 'value'

// Use getRaw for the raw format
const rawValue = await keyv.getRaw('key');
// rawValue: { value: 'value', expires: 1234567890 }

// For multiple keys
const values = await keyv.getMany(['key1', 'key2']);
const rawValues = await keyv.getManyRaw(['key1', 'key2']);
```

---

### Iterator Changes

The iterator is now a proper class method instead of a dynamically assigned property. It no longer requires any arguments — namespace handling is automatic.

Key changes:
- `iterator()` is now a built-in async generator method, not an assignable property
- No arguments required (previously required `keyv.namespace`)
- Automatically handles Map stores, storage adapters with `iterator()`, and unsupported stores
- Expired entries are automatically filtered and deleted during iteration
- The `IteratorFunction` type has been removed
- If the store does not support iteration, an `error` event is emitted instead of throwing

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

for await (const [key, value] of keyv.iterator(keyv.namespace)) {
  console.log(key, value);
}
```

**v6 (after):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

for await (const [key, value] of keyv.iterator()) {
  console.log(key, value);
}
```

---

### Removed `.ttlSupport` from Storage Adapters

The `ttlSupport` property has been removed from storage adapters. Keyv now automatically detects the storage adapter type and uses `KeyvMemoryAdapter` for adapters that don't natively support TTL.

**v5 (before):**
```javascript
class MyAdapter {
  ttlSupport = false;
  // ...
}
```

**v6 (after):**
```javascript
// No need to specify ttlSupport
// Keyv automatically handles TTL through KeyvMemoryAdapter if needed
class MyAdapter {
  // ...
}
```

---

### Returns `undefined` Instead of `null`

Keyv now consistently returns `undefined` instead of `null` for missing values. Previously, some storage adapters returned `null`, which was passed through. Now we normalize to `undefined`.

**v5 (before):**
```javascript
const value = await keyv.get('nonexistent');
// value could be null or undefined depending on the adapter
```

**v6 (after):**
```javascript
const value = await keyv.get('nonexistent');
// value is always undefined
```

---

### Compression Adapter Interface Change

Compression adapters now use a simplified interface:

```typescript
interface KeyvCompression {
  compress: (value: string) => string;
  decompress: (value: string) => T;
}
```

**Important:** Compression requires `serialization` to be enabled (default) or values must be strings.

**v6 usage:**
```javascript
import Keyv from 'keyv';
import KeyvGzip from '@keyv/compress-gzip';

const compression = new KeyvGzip();
const keyv = new Keyv({ compression });

// Serialization is enabled by default (@keyv/serialize)
await keyv.set('key', { foo: 'bar' });
```

> **Note:** Encryption and compression require string values. If your values are not strings, you must use `serialization`.

---

### `@keyv/memcache` Moves from `memjs` to `memcache`

The `@keyv/memcache` package will switch its underlying Memcached client library from [`memjs`](https://www.npmjs.com/package/memjs) to [`memcache`](https://www.npmjs.com/package/memcache).

**Why the change:**
- `memjs` uses the binary protocol and has not been actively maintained
- `memcache` is actively maintained with a promise-based API and support for features such as consistent hashing, connection pooling, and hooks/events

**What this means for you:**
- If you are using `@keyv/memcache` through Keyv with default settings, **no changes are needed** — the adapter API remains the same
- If you are passing `memjs`-specific client options through to the underlying client, you will need to update them to match the `memcache` client API

---

## New Features

### Keyv v6 Versioning

Starting with v6, all Keyv packages and adapters will use **unified versioning**. This means every package in the Keyv ecosystem will share the same version number and be released together.

**What this means for you:**
- All `@keyv/*` packages will have the same version (e.g., `keyv@6.0.0`, `@keyv/redis@6.0.0`, `@keyv/sqlite@6.0.0`)
- When you upgrade Keyv, you can upgrade all adapters to the same version with confidence that they are compatible
- No more wondering which adapter version works with which Keyv version

**Example of unified versions:**
```
keyv: 6.0.0
@keyv/redis: 6.0.0
@keyv/sqlite: 6.0.0
@keyv/postgres: 6.0.0
@keyv/serialize: 6.0.0
@keyv/compress-gzip: 6.0.0
```

This approach is used by many popular projects:
- **[Vitest](https://vitest.dev)** - All packages in the Vitest monorepo share the same version
- **[Babel](https://babeljs.io)** - All `@babel/*` packages are versioned together
- **[Jest](https://jestjs.io)** - All Jest packages use unified versioning
- **[Angular](https://angular.io)** - All `@angular/*` packages share the same version
- **[Vue](https://vuejs.org)** - Vue and its companion packages are versioned together

Unified versioning simplifies dependency management and ensures compatibility across the entire Keyv ecosystem.

### Keyv v5 Maintenance Mode

With the release of Keyv v6, Keyv v5 will move to maintenance mode. No major functionality will be added to Keyv v5. Only maintenance and security fixes will be applied going forward.

We encourage all users to migrate to v6 to take advantage of the latest features and improvements. The `v5` branch will remain available in the mono repo for reference.

---

### Browser Compatibility

Keyv v6 is now fully compatible with browser environments. You can use Keyv in frontend applications with appropriate storage adapters.

```javascript
import Keyv from 'keyv';

// Works in the browser
const keyv = new Keyv({ store: new Map() });
```

---

### Serialization Adapters

The default serialization module is `@keyv/serialize`, which uses the built-in `JSON` module. The property has been simplified to just `serialization`.

```javascript
import Keyv from 'keyv';
import KeyvSerialize from '@keyv/serialize';

const keyv = new Keyv({ serialization: new KeyvSerialize() });

// You can also set it via the property
keyv.serialization = new KeyvSerialize();
```

**Available Serialization Adapters:**

| Package | Description |
|---------|-------------|
| `@keyv/serialize` | **Default** - Based on built-in `JSON` |
| `@keyv/serialize-superjson` | Supports `BigInt`, `Date`, `Map`, `Set`, and more |
| `@keyv/serialize-msgpackr` | High-performance binary serialization |

#### Disabling Serialization

For in-memory storage or when serialization isn't needed (and you're not using encryption/compression):

```javascript
import Keyv from 'keyv';

const keyv = new Keyv({ store: new Map(), serialization: false });

// Or set via property
keyv.serialization = undefined;
```

> **Note:** If you want to use encryption or compression, you must have serialization enabled.

#### Custom Serialization

Create your own serialization adapter using the `KeyvSerialization` interface:

```typescript
interface KeyvSerialization {
  parse: (value: string) => T;
  stringify: (value: unknown) => string;
}
```

```javascript
import Keyv from 'keyv';

const customSerializer = {
  stringify: (value) => JSON.stringify(value),
  parse: (value) => JSON.parse(value)
};

const keyv = new Keyv({ serialization: customSerializer });
```

---

### Encryption Adapters

You can now add encryption to values with the following adapters:

| Package | Description |
|---------|-------------|
| `@keyv/encryption` | Node.js built-in encryption (configurable) |
| `@keyv/encryption-browser` | Browser-compatible encryption using `crypto-js` |
| `@keyv/encryption-argon` | Modern, high-performance encryption for Node.js |

```javascript
import Keyv from 'keyv';
import KeyvEncryption from '@keyv/encryption';

const encryption = new KeyvEncryption({ key: 'your_secret_key_here' });
const keyv = new Keyv({ encryption });

// Or set via property
keyv.encryption = encryption;

await keyv.set('sensitive', { password: 'secret' });
```

#### Custom Encryption

Create your own encryption adapter using the `KeyvEncryption` interface:

```typescript
interface KeyvEncryption {
  encrypt: (value: string) => string;
  decrypt: (value: string) => T;
}
```

> **Note:** Encryption requires string values. Use `serialization` (enabled by default) if your values are not strings.

---

### Native Hashing for Key and Namespace

Keyv now supports native hashing when `key` or `namespace` is too long. By default, this is not enabled but if you set `keyLength` or `namespaceLength` and submit a key it will use hashing to keep the maximum length and not error out. This helps with many of the storage adapters such as `memcache`, `postgres`, `mysql`, `sqlite`, etc.

```javascript
import Keyv from 'keyv';

const keyv = new Keyv({
  keyLength: 255,
  namespaceLenght: 255,
});
```

You can even set what hash algorithm to use via the `hash` property as we use [hashery](https://npmjs.org/package/hashery).

```javascript
import Keyv from 'keyv';

const keyv = new Keyv({
  keyLength: 255,
  namespaceLenght: 255,
  hashAlgorithm: 'SHA-256'
});

// or via properties

keyv.hash.defaultAlgorithm = 'DJB2';
```

### New Identification Functions

Keyv v6 provides new functions to help identify adapters and capabilities.

#### `isKeyv`

Detects if an object is a Keyv instance by checking for Keyv-specific methods and properties:

```javascript
import Keyv, { isKeyv } from 'keyv';

const keyv = new Keyv();

isKeyv(new Map());
// { keyv: false, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: false, setMany: false, deleteMany: false, hasMany: false,
//   disconnect: false, getRaw: false, getManyRaw: false, hooks: false,
//   stats: false, iterator: false }

isKeyv(keyv);
// { keyv: true, get: true, set: true, delete: true, clear: true, has: true,
//   getMany: true, setMany: true, deleteMany: true, hasMany: true,
//   disconnect: true, getRaw: true, getManyRaw: true, hooks: true,
//   stats: true, iterator: false }
```

The `keyv` property is `true` when the object has all core Keyv methods (`get`, `set`, `delete`, `clear`) plus `hooks` and `stats` properties.

#### `isKeyvStorage`

Detects if an object is a Keyv storage adapter by checking for required adapter methods:

```javascript
import { isKeyvStorage } from 'keyv';

isKeyvStorage(new Map());
// { keyvStorage: false, get: true, set: true, delete: true, clear: true,
//   has: true, getMany: false, setMany: false, deleteMany: false,
//   hasMany: false, disconnect: false, iterator: false, namespace: false }

isKeyvStorage(redisAdapter);
// { keyvStorage: true, get: true, set: true, delete: true, clear: true,
//   has: true, getMany: true, setMany: true, deleteMany: true,
//   hasMany: true, disconnect: true, iterator: true, namespace: true }
```

The `keyvStorage` property is `true` when the object has all core storage adapter methods (`get`, `set`, `delete`, `clear`).

#### Additional Capability Checks

Keyv v6 also provides functions for checking compression, serialization, and encryption adapters:

```javascript
import { isKeyvCompression, isKeyvSerialization, isKeyvEncryption } from 'keyv';

isKeyvCompression(gzipAdapter);
// { keyvCompression: true, compress: true, decompress: true }

isKeyvSerialization(customSerializer);
// { keyvSerialization: true, stringify: true, parse: true }

isKeyvEncryption(aesAdapter);
// { keyvEncryption: true, encrypt: true, decrypt: true }
```

---

### Memory Adapter

Keyv v6 includes `KeyvMemoryAdapter`, a wrapper class for storage types that don't conform to v6 storage adapter requirements (such as `Map`-compatible or legacy adapters).

**Features:**
- Handles namespacing using key prefixing
- Extends the adapter with v6 functions: `getMany`, `setMany`, `getRaw`, `getManyRaw`
- Attempts iteration using various strategies
- Adds TTL support and handles expiration

```javascript
import Keyv from 'keyv';

// Map-compatible stores are automatically wrapped
const keyv = new Keyv({ store: new Map() });

// Check if your adapter will use KeyvMemoryAdapter
const capabilities = keyv.getStoreCapabilities(yourStore);
if (capabilities.mapCompatible && !capabilities.adapter) {
  console.log('This store will use KeyvMemoryAdapter');
}
```

---

## Getting Help

If you encounter issues during migration:

1. Check the [Keyv documentation](https://keyv.org)
2. Search [existing issues](https://github.com/jaredwray/keyv/issues)
3. Open a [new issue](https://github.com/jaredwray/keyv/issues/new) with details about your migration problem
