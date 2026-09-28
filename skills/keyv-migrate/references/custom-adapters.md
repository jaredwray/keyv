# Custom storage adapters

Use this when the project implements its own storage adapter, or tests one with `@keyv/test-suite`.

## Do you have to change it?

No, but you should. An adapter that doesn't declare the v6 contract keeps working: Keyv wraps it in `KeyvBridgeAdapter`, which turns the absolute `expires` back into a relative `ttl` and fills in missing batch methods. A synchronous `Map`-like store goes in a `KeyvMemoryAdapter` instead. Moving to the v6 contract removes the conversion and fixes a v5 problem: adapters that recovered the expiry by parsing the stored value lost it under compression, encryption, or a non-JSON serializer, so those entries never expired.

## The v6 contract

```ts
import { Hookified } from 'hookified';
import { keyvStorageCapability, type KeyvStorageAdapter, type KeyvStorageEntry } from 'keyv';

class MyAdapter extends Hookified implements KeyvStorageAdapter {
  namespace?: string;

  // Opts in to the v6 contract (capabilities.expires === true).
  get capabilities() {
    return keyvStorageCapability(this);
  }

  async get(key: string) { /* return the stored value, or undefined */ }
  async getMany(keys: string[]) { /* values in key order, undefined for misses */ }
  async set(key: string, value: unknown, expires?: number) { /* return true on success */ }
  async setMany(entries: KeyvStorageEntry[]) { /* return boolean[] */ }
  async delete(key: string) { /* true if the key existed */ }
  async deleteMany(keys: string[]) { /* return boolean[] */ }
  async has(key: string) { /* boolean */ }
  async hasMany(keys: string[]) { /* boolean[] */ }
  async clear() { /* only the current namespace */ }
  async *iterator() { /* yield [key, value] for the current namespace, keys without the prefix */ }
  async disconnect() {}
}
```

What changed from v5:

- **`set(key, value, expires?)`**: `expires` is an absolute Unix timestamp in milliseconds, not a relative `ttl`. `undefined` means no expiry. A value in the past means already expired: accept the call and don't keep the entry. Store `expires` as given; don't compute `Date.now() + ttl`, and never parse the value to find it.
- **`setMany(entries)`** receives `{ key, value, expires? }` entries (`KeyvStorageEntry`), not `{ key, value, ttl? }`.
- **Required methods.** `has`, `hasMany`, `getMany`, `setMany`, and `deleteMany` are now required, along with `get`, `set`, `delete`, and `clear`. `iterator` and `disconnect` are optional.
- **Return values.** `deleteMany` returns `boolean[]`. `setMany` returns `boolean[]` (or `undefined`). Missing values are `undefined`, never `null`.
- **Namespace.** Keyv no longer prefixes keys. The adapter reads its `namespace` property (a string or `undefined`) and scopes keys, `clear()`, and `iterator()` to it. Keyv sets it when the user passes a namespace. With no namespace, `clear()` should remove only entries without a namespace, not the whole backend.
- **Iterator.** `iterator()` takes no arguments and yields keys without the namespace prefix. The bridge still calls a legacy `iterator(namespace)`.
- **Removed.** Drop `opts`, `ttlSupport`, and `dialect`.
- **Errors.** Report each failure once: reject, or emit `error` and return a fallback value, but not both.
- **Events.** Extend Hookified (`import { Hookified } from 'hookified'`) or another emitter with `on` and `emit`. `IEventEmitter` now comes from `hookified`.

## Before and after

```ts
// v5
class MyAdapter extends EventEmitter {
  opts = { dialect: 'custom' };
  ttlSupport = true;
  async set(key: string, value: string, ttl?: number) {
    const expires = typeof ttl === 'number' ? Date.now() + ttl : undefined;
    await this.db.put(key, value, expires);
  }
  async setMany(entries: Array<{ key: string; value: string; ttl?: number }>) { /* ... */ }
  async deleteMany(keys: string[]): Promise<boolean> { /* ... */ }
}

// v6
class MyAdapter extends Hookified implements KeyvStorageAdapter {
  namespace?: string;
  get capabilities() {
    return keyvStorageCapability(this);
  }
  async set(key: string, value: string, expires?: number) {
    await this.db.put(this.prefix(key), value, expires);
    return true;
  }
  async setMany(entries: KeyvStorageEntry[]) {
    return Promise.all(entries.map((entry) => this.set(entry.key, entry.value as string, entry.expires)));
  }
  async deleteMany(keys: string[]): Promise<boolean[]> { /* ... */ }
  private prefix(key: string) {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }
}
```

If the adapter's storage key format changes (for example, it now adds the namespace itself where Keyv used to), existing data needs the same care as a built-in adapter: see [stored-data.md](stored-data.md).

## `@keyv/test-suite` v6

- No default export. Import each suite by name.
- The first argument is Vitest's `test` (or `it`) function, not the whole `vitest` module.
- `keyvNamespaceTest` is now `keyvNamespaceTests`. `keyvCompresstionTests` is now `compressionTestSuite`, and it isn't exported with a `KeyvGzip`.
- `storageTestSuite` tests the adapter directly, without Keyv. It runs `storageBasicTests`, `storageBatchTests`, `storageIteratorTests`, `storageTtlTests`, `storageNamespaceTests`, and `storageDisconnectTests`, which are also exported.

```js
// v5
import * as test from 'vitest';
import keyvTestSuite, { keyvIteratorTests } from '@keyv/test-suite';
import Keyv from 'keyv';

keyvTestSuite(test, Keyv, store);

// v6
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from '@keyv/test-suite';
import { Keyv } from 'keyv';
import { test } from 'vitest';

const store = () => new MyAdapter();
keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);   // if the adapter has iterator()
storageTestSuite(test, store);          // pass { ttlGranularity: 'seconds' } for second-precision TTLs
```

`storageTestSuite` options include `ttl: false` (only when the backend has no TTL at all), `ttlGranularity: 'seconds'`, and switches for the batch, iterator, namespace, and disconnect groups.

## Third-party adapters

Community adapters that haven't adopted the v6 contract, such as `keyv-file`, keep working through the bridge. Pass them as the store as before, and check that the project's version of the adapter still installs next to Keyv v6 (its `keyv` peer dependency range).
