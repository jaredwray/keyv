# Keyv v6 Migration Guide

We are pleased to announce Keyv v6 with major enhancements and some breaking changes. This guide will help you understand how to migrate from v5 to v6. For most users, the transition will be straightforward.

## Table of Contents

- [Roadmap & Progress](#roadmap--progress)
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
- [New Features](#new-features)
  - [Command Timeout at Keyv Level](#command-timeout-at-keyv-level)
  - [In-Memory Uses `@keyv/bigmap` by Default](#in-memory-uses-keyvbigmap-by-default)
  - [Browser Compatibility](#browser-compatibility)
  - [Serialization Adapters](#serialization-adapters)
  - [Encryption Adapters](#encryption-adapters)
  - [New Identification Functions](#new-identification-functions)
  - [Generic Storage Adapter](#generic-storage-adapter)

---

## Roadmap & Progress

| Task | Status |
|------|--------|
| Finalize namespace handling in storage adapters | :white_check_mark: Complete |
| Remove `opts` property | :white_check_mark: Complete |
| Integrate Hookified library | :white_check_mark: Complete |
| Update `deleteMany` return type | :white_check_mark: Complete |
| Update `setMany` signature and return type | :white_check_mark: Complete |
| Add `getRaw` and `getManyRaw` methods | :white_check_mark: Complete |
| Refactor iterator implementation | :white_check_mark: Complete |
| Implement `KeyvGenericStore` | :white_check_mark: Complete |
| Add serialization adapters | :white_check_mark: Complete |
| Add encryption adapters | :white_check_mark: Complete |
| Add compression interface standardization | :white_check_mark: Complete |
| Browser compatibility | :white_check_mark: Complete |
| Documentation updates | :construction: In Progress |
| Storage adapter updates | :construction: In Progress |
| Release v6.0.0 | :hourglass: Pending |

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

For legacy storage adapters or `Map`-compatible stores, we have added `KeyvGenericStore` which handles advanced features without overloading the main Keyv codebase. See [Generic Storage Adapter](#generic-storage-adapter) for more details.

---

### `opts` Property Removed

In Keyv v5, we began removing `opts` as a passed-around value. In v6, `opts` is no longer passed around or provided as a property. All properties are now directly part of the Keyv class.

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

We have moved to the standard [Hookified](https://hookified.org) library instead of our custom implementation. This introduces some changes to hook function calls and naming conventions.

**Available Hooks:**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv();

// Available hooks
keyv.onHook('preSet', async (key, value, ttl) => {
  console.log(`Setting ${key}`);
});

keyv.onHook('postSet', async (key, value, ttl) => {
  console.log(`Set ${key}`);
});

keyv.onHook('preGet', async (key) => {
  console.log(`Getting ${key}`);
});

keyv.onHook('postGet', async (key, value) => {
  console.log(`Got ${key}: ${value}`);
});

keyv.onHook('preGetMany', async (keys) => {
  console.log(`Getting keys: ${keys}`);
});

keyv.onHook('postGetMany', async (keys, values) => {
  console.log(`Got values for keys`);
});

keyv.onHook('preDelete', async (key) => {
  console.log(`Deleting ${key}`);
});

keyv.onHook('postDelete', async (key, deleted) => {
  console.log(`Deleted ${key}: ${deleted}`);
});

keyv.onHook('preClear', async () => {
  console.log('Clearing store');
});

keyv.onHook('postClear', async () => {
  console.log('Store cleared');
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

**Important:** By default, `throwOnErrors` is set to `true`. If there are no listeners for the `error` event, it will throw an `Error`. You can disable this:

```javascript
const keyv = new Keyv({ throwOnErrors: false });
```

To have errors thrown on hooks, set `throwOnHooks` to `true`:

```javascript
const keyv = new Keyv({ throwOnHooks: true });
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

The iterator no longer requires an argument. We have also improved iteration handling and added an `isIterable()` function to check if iteration is supported.

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

// Check if iteration is supported
if (keyv.isIterable()) {
  // No argument required
  for await (const [key, value] of keyv.iterator()) {
    console.log(key, value);
  }
}
```

---

### Removed `.ttlSupport` from Storage Adapters

The `ttlSupport` property has been removed from storage adapters. Keyv now automatically detects the storage adapter type and uses `KeyvGenericStore` for adapters that don't natively support TTL.

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
// Keyv automatically handles TTL through KeyvGenericStore if needed
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

## New Features

### Command Timeout at Keyv Level

<!-- TODO: Add documentation for command timeout feature -->

---

### In-Memory Uses `@keyv/bigmap` by Default

The default in-memory store now uses `@keyv/bigmap`, which provides better performance and handles larger datasets more efficiently than the standard `Map`.

```javascript
import Keyv from 'keyv';

// Default store is now @keyv/bigmap
const keyv = new Keyv();
```

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

### Generic Storage Adapter

Keyv v6 includes `KeyvGenericStore`, a wrapper class for storage types that don't conform to v6 storage adapter requirements (such as `Map`-compatible or legacy adapters).

**Features:**
- Handles namespacing using key prefixing
- Extends the adapter with v6 functions: `getMany`, `setMany`, `getRaw`, `getManyRaw`
- Attempts iteration using various strategies
- Adds TTL support and handles expiration

```javascript
import Keyv from 'keyv';

// Map-compatible stores are automatically wrapped
const keyv = new Keyv({ store: new Map() });

// Check if your adapter will use KeyvGenericStore
const capabilities = keyv.getStoreCapabilities(yourStore);
if (capabilities.mapCompatible && !capabilities.adapter) {
  console.log('This store will use KeyvGenericStore');
}
```

---

## Quick Migration Checklist

- [ ] Remove `useKeyPrefix` and `keyPrefix` options
- [ ] Replace `keyv.opts.*` with direct property access (`keyv.*`)
- [ ] Replace `serialize`/`deserialize` options with `serialization` adapter
- [ ] Update hook usage to Hookified syntax (`onHook`)
- [ ] Update `deleteMany` handling to expect `boolean[]`
- [ ] Update `setMany` to use `KeyvEntry[]` format and handle `boolean[]` return
- [ ] Replace `get(key, { raw: true })` with `getRaw(key)`
- [ ] Replace `getMany(keys, { raw: true })` with `getManyRaw(keys)`
- [ ] Remove iterator arguments and add `isIterable()` checks
- [ ] Remove `ttlSupport` from custom storage adapters
- [ ] Update `null` checks to `undefined` checks
- [ ] Update compression adapters to new interface
- [ ] Add `error` event listener or set `throwOnErrors: false`

---

## Getting Help

If you encounter issues during migration:

1. Check the [Keyv documentation](https://keyv.org)
2. Search [existing issues](https://github.com/jaredwray/keyv/issues)
3. Open a [new issue](https://github.com/jaredwray/keyv/issues/new) with details about your migration problem

---

*Last updated: February 2026*
