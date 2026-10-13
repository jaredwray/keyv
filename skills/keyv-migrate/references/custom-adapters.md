# Custom storage adapters

Use this when the project implements its own storage adapter, or tests one with `@keyv/test-suite`.

## Do you have to change it?

No, but you should. An adapter that doesn't declare the v6 contract keeps working: Keyv wraps it in `KeyvBridgeAdapter`, which turns the absolute `expires` back into a relative `ttl` and fills in missing batch methods. A synchronous `Map`-like store goes in a `KeyvMemoryAdapter` instead. One case does need a change: with a namespace, `clear()` on a wrapped store has to find that namespace's keys, through `keys()` on a `Map`-like store or `iterator()` on an async one, unless the adapter manages its own namespace. Without them, `clear()` fails instead of deleting every entry as v5 did. Moving to the v6 contract removes the conversion and fixes a v5 problem: adapters that recovered the expiry by parsing the stored value lost it under compression, encryption, or a non-JSON serializer, so those entries never expired.

Once an adapter implements the v6 contract, it no longer works with Keyv v5: v5 passes a relative `ttl` where the adapter now reads an absolute timestamp, and `keyvStorageCapability` doesn't exist in v5. A published adapter needs a new major version; see [Publishing an adapter](#publishing-an-adapter).

## The v6 contract

This in-memory adapter implements the whole contract and passes the v6 test suite (`keyvTestSuite`, `keyvIteratorTests`, and `storageTestSuite`). Use it as the reference for types and edge cases:

```ts
import { Hookified } from 'hookified';
import {
  keyvStorageCapability,
  type KeyvStorageAdapter,
  type KeyvStorageEntry,
  type KeyvStorageGetResult,
} from 'keyv';

type Entry = { value: unknown; expires?: number };

export class MyAdapter extends Hookified implements KeyvStorageAdapter {
  namespace?: string;
  private readonly data = new Map<string, Entry>();

  // Opts in to the v6 contract (capabilities.expires === true).
  get capabilities() {
    return keyvStorageCapability(this);
  }

  async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
    const entry = this.read(key);
    return entry?.value as KeyvStorageGetResult<Value>;
  }

  async getMany<Value>(keys: string[]): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
    return Promise.all(keys.map((key) => this.get<Value>(key)));
  }

  // expires is an absolute Unix timestamp in milliseconds, or undefined for no expiry.
  async set(key: string, value: unknown, expires?: number): Promise<boolean> {
    if (expires !== undefined && expires <= Date.now()) {
      this.data.delete(this.storageKey(key)); // already expired: accept the call, keep nothing
      return true;
    }

    this.data.set(this.storageKey(key), { value, expires });
    return true;
  }

  async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
    return Promise.all(entries.map((entry) => this.set(entry.key, entry.value, entry.expires)));
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.read(key) !== undefined;
    this.data.delete(this.storageKey(key));
    return existed;
  }

  async deleteMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((key) => this.delete(key)));
  }

  async has(key: string): Promise<boolean> {
    return this.read(key) !== undefined;
  }

  async hasMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((key) => this.has(key)));
  }

  // Removes only the current namespace; with no namespace, only keys stored without one.
  async clear(): Promise<void> {
    for (const storedKey of [...this.data.keys()]) {
      if (this.belongsToNamespace(storedKey)) {
        this.data.delete(storedKey);
      }
    }
  }

  // Yields [key, value] pairs for the current namespace, keys without the prefix.
  async *iterator<Value>(): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void> {
    for (const [storedKey, entry] of this.data) {
      if (this.belongsToNamespace(storedKey) && !this.isExpired(entry)) {
        yield [this.unprefix(storedKey), entry.value as Awaited<Value>];
      }
    }
  }

  async disconnect(): Promise<void> {}

  private read(key: string): Entry | undefined {
    const entry = this.data.get(this.storageKey(key));
    if (entry && this.isExpired(entry)) {
      this.data.delete(this.storageKey(key));
      return undefined;
    }

    return entry;
  }

  private isExpired(entry: Entry): boolean {
    return entry.expires !== undefined && Date.now() > entry.expires;
  }

  // Keyv v6 doesn't prefix keys, so the adapter keeps namespaces apart itself.
  private storageKey(key: string): string {
    return this.namespace ? `${this.namespace}::${key}` : `::${key}`;
  }

  private belongsToNamespace(storedKey: string): boolean {
    return storedKey.startsWith(this.namespace ? `${this.namespace}::` : '::');
  }

  private unprefix(storedKey: string): string {
    return storedKey.slice(storedKey.indexOf('::') + 2);
  }
}
```

What changed from v5, and the rules the test suite checks:

- **`set(key, value, expires?)`**: `expires` is an absolute Unix timestamp in milliseconds, not a relative `ttl`. `undefined` means no expiry. A value `<= Date.now()` is already expired: accept the call and don't keep the entry. On reads, treat an entry as expired once `Date.now() > expires`. Store `expires` as given; don't compute `Date.now() + ttl`, and never parse the value to find it.
- **`setMany(entries)`** receives `{ key, value, expires? }` entries (`KeyvStorageEntry`), not `{ key, value, ttl? }`, and returns `boolean[]`. Keyv also accepts `undefined` for backward compatibility and treats it as success for every entry.
- **Required methods.** `has`, `hasMany`, `getMany`, `setMany`, and `deleteMany` are now required, along with `get`, `set`, `delete`, and `clear`. `iterator` and `disconnect` are optional.
- **Return values.** `deleteMany` returns `boolean[]`, one per key, `true` when the key existed. Missing values are `undefined`, never `null`. An expired entry counts as missing for `get`, `has`, `delete`, and `iterator`.
- **Values.** Store `value` as received. With Keyv's default serializer it is a string; with `serialization: false` it can be any value.
- **Namespace.** Keyv no longer prefixes keys, and it writes its `namespace` to the adapter's `namespace` property, including later changes. Treat `undefined` and `''` as no namespace. Scope keys, `clear()`, and `iterator()` to the namespace. With no namespace, `clear()` removes only entries stored without one. When the backend has a flat keyspace, use a separator that keys are unlikely to contain (Redis uses `::`), or store the namespace in its own field. Don't share one adapter instance between Keyv instances with different namespaces: create one per Keyv instance.
- **`keyvStorageCapability(this)`** returns what `detectKeyvStorage` finds on the adapter plus `expires: true`. It makes `keyv` a runtime import of the adapter, so `keyv` must be installed as a peer.
- **Removed.** Drop `opts`, `ttlSupport`, and `dialect`.
- **Errors.** Report each failure once: reject, or emit `error` and return a fallback value, but not both. Keyv re-emits the adapter's `error` events.
- **Events.** Extend Hookified, as the built-in adapters do, and add `hookified` (`^3`) to the adapter's dependencies. A class that extends Node.js `EventEmitter` still works at run time, but it doesn't satisfy the `KeyvStorageAdapter` type: TypeScript rejects `implements KeyvStorageAdapter` because `listeners()` returns `Function[]`. `IEventEmitter` now comes from `hookified`.

Check the result: `new Keyv(new MyAdapter()).store` must be the adapter itself. A `KeyvBridgeAdapter` there means Keyv doesn't see the v6 contract.

If the adapter's storage key format changes, existing data needs the same care as a built-in adapter: see [stored-data.md](stored-data.md#custom-adapters).

## `@keyv/test-suite` v6

- No default export. Import each suite by name.
- The first argument is Vitest's `test` (or `it`) function, not the whole `vitest` module.
- `keyvTestSuite` runs `keyvApiTests`, `keyvValueTests`, and `keyvNamespaceTests`. `keyvIteratorTests` is separate.
- `keyvNamespaceTest` is now `keyvNamespaceTests`. `keyvCompresstionTests` is now `compressionTestSuite`, and the suite doesn't export a `KeyvGzip`.
- `storageTestSuite(test, store, options)` tests the adapter directly, without Keyv. It runs `storageBasicTests`, `storageBatchTests`, `storageIteratorTests`, `storageTtlTests`, `storageNamespaceTests`, and `storageDisconnectTests`, which are also exported. Its options are `basic`, `batch`, `iterator`, `ttl`, `namespace`, and `disconnect` (set one to `false` to skip that group), `ttlGranularity` (`'milliseconds'` or `'seconds'`), and `missingValue` (`undefined` or `null`). Use `ttl: false` only when the backend has no TTL at all.
- `@keyv/test-suite` depends on `vitest` `^4.1` directly. A project on an older Vitest can end up with two copies; upgrade Vitest along with it.

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
storageTestSuite(test, store);
```

## Publishing an adapter

- **Peer range.** Declare `keyv` as a peer using a stable v6 range such as `^6.1.0`, raising the minimum if the adapter relies on APIs added later. If intentionally targeting a pre-release, use a range that explicitly accepts it; stable ranges exclude pre-releases. Don't keep `^5 ||` in the range once the adapter uses the v6 contract.
- **Version.** Release it as a new major version. Tell users that code calling the adapter directly must now pass an absolute `expires`.
- **Runtime.** Set `engines.node` to `>=22.19.0` to match Keyv v6.
- **Dev dependencies.** Pin `keyv` and `@keyv/test-suite` to the same exact version as the rest of the upgrade; see [dependencies.md](dependencies.md).

## Third-party adapters

Community adapters that haven't adopted the v6 contract, such as `keyv-file`, keep working through the bridge. Pass them as the store as before, and check that the project's version of the adapter still installs next to Keyv v6 (its `keyv` peer dependency range).
