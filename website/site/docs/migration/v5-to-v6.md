---
title: 'v5 to v6 Migration'
sidebarTitle: 'v5 to v6'
parent: 'Migration'
order: 2
---

# Keyv v6

We are pleased to announce Keyv v6 with major enhancements and some breaking changes. This guide will help you understand how to migrate from v5 to v6. For most users, the transition will be straightforward.

**Important:** With the release of v6, Keyv v5 is in maintenance mode. v5 only receives security fixes and minor maintenance updates. The previous documentation site is archived at [keyv.org/v5](/v5/). The `v5` branch remains in the monorepo.

> **Using an AI coding agent?** Tell it: *"Upgrade this project to Keyv v6 using https://keyv.org/skills/migrate"*. The skill covers everything on this page and asks before it touches stored data. See [Migrate with an AI Agent](/docs/migration/ai-agent-skill/).

## Table of Contents

- [Roadmap & Progress](#roadmap--progress)
- [Quick Migration Guide](#quick-migration-guide)
- [Breaking Changes](#breaking-changes)
  - [Node.js 22.19 or Later Is Required](#nodejs-2219-or-later-is-required)
  - [Namespace Overhaul](#namespace-overhaul)
  - [The Default `keyv` Namespace Was Removed](#the-default-keyv-namespace-was-removed)
  - [`clear()` Without a Namespace Clears More](#clear-without-a-namespace-clears-more)
  - [`opts` Property Removed](#opts-property-removed)
  - [Serialization Replaces `serialize` and `deserialize`](#serialization-replaces-serialize-and-deserialize)
  - [Hookified for Events and Hooks](#hookified-for-events-and-hooks)
  - [Error Handling Changed and `throwOnErrors` Was Removed](#error-handling-changed-and-throwonerrors-was-removed)
  - [`deleteMany` Returns `boolean[]`](#deletemany-returns-boolean)
  - [`setMany` Uses `KeyvEntry[]` and Returns `boolean[]`](#setmany-uses-keyventry-and-returns-boolean)
  - [`get` and `getMany` No Longer Support Raw](#get-and-getmany-no-longer-support-raw)
  - [Iterator Changes](#iterator-changes)
  - [Removed `.ttlSupport` from Storage Adapters](#removed-ttlsupport-from-storage-adapters)
  - [Storage Adapters Receive Absolute `expires` Instead of Relative `ttl`](#storage-adapters-receive-absolute-expires-instead-of-relative-ttl)
  - [Returns `undefined` Instead of `null`](#returns-undefined-instead-of-null)
  - [Compression Adapter Interface Change](#compression-adapter-interface-change)
  - [Other Silent Behavior Changes](#other-silent-behavior-changes)
  - [`@keyv/test-suite` API Changes](#keyvtest-suite-api-changes)
  - [Libraries That Embed Keyv v5](#libraries-that-embed-keyv-v5)
  - [`@keyv/memcache` Moves from `memjs` to `memcache`](#keyvmemcache-moves-from-memjs-to-memcache)
  - [`@keyv/etcd` Default `ttl` Applies Per Key](#keyvetcd-default-ttl-applies-per-key)
  - [`@keyv/dynamo` Keys Without a TTL No Longer Expire](#keyvdynamo-keys-without-a-ttl-no-longer-expire)
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
| Remove `opts` property in Keyv and Storage Adapters | COMPLETED |
| Add encryption adapters | COMPLETED |
| Browser compatibility | COMPLETED |
| Stats System to be Event Driven | COMPLETED |
| Test Suite Overhaul | COMPLETED |
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
| Storage adapters receive absolute `expires` instead of relative `ttl` | COMPLETE |

---

## Quick Migration Guide

For most users, migrating from v5 to v6 involves a few key changes:

1. **Upgrade Node.js and pin one version** - v6 requires Node.js 22.19 or later. Install `keyv` and every `@keyv/*` package at the same exact v6 version; see [Versioning & Release Tags](/docs/migration/versioning/).

2. **Keep reading data written by v5** - v5 stored keys under a default `keyv` namespace, and v6 has no default. Without `namespace: 'keyv'`, or the namespace you already used, data written by v5 reads as missing. Redis, Memcache, Valkey, and MongoDB need more than that; see [The Default `keyv` Namespace Was Removed](#the-default-keyv-namespace-was-removed). SQLite converts its table the first time v6 connects, and PostgreSQL, MySQL, and MongoDB have migration scripts. These changes are one-way, so back up first.

3. **Update property access** - The `opts` property has been removed. Use direct property access instead (`keyv.namespace` instead of the old `keyv.opts.namespace`)

4. **Update serialization** - Replace `serialize`/`deserialize` options with the `serialization` adapter. v6 ships a built-in `KeyvJsonSerializer` (no extra package). For SuperJSON or MessagePack, install those packages:
   ```javascript
   // v5
   const keyv = new Keyv({ serialize: JSON.stringify, deserialize: JSON.parse });

   // v6 (default JSON serializer — Buffer + BigInt)
   const keyv = new Keyv();

   // v6 custom
   import { superJsonSerializer } from '@keyv/serialize-superjson';
   const keyv = new Keyv({ serialization: superJsonSerializer });
   ```

5. **Update raw value access** - Replace `get(key, { raw: true })` with `getRaw(key)` and `getMany(keys, { raw: true })` with `getManyRaw(keys)`

6. **Handle new return types** - `deleteMany` and `setMany` now return `boolean[]` instead of a single `boolean`

7. **Attach an `error` listener** - A failed operation now rejects unless an `error` listener is attached, and the `throwOnErrors` option was removed. To get failures back as fallback values, as many v5 methods returned them, add `keyv.on('error', ...)`. See [Error Handling Changed and `throwOnErrors` Was Removed](#error-handling-changed-and-throwonerrors-was-removed).

8. **Check compressed data and libraries built on Keyv v5** - Values that v5 wrote with compression can't be read by v6. Libraries such as `cache-manager` and `cacheable` depend on Keyv v5, so don't hand them a v6 `Keyv` or v6 adapters until they support v6. See [Compression Adapter Interface Change](#compression-adapter-interface-change) and [Libraries That Embed Keyv v5](#libraries-that-embed-keyv-v5).

Many v6 changes don't fail at compile time. In plain JavaScript, removed options are ignored, and `new Keyv('redis://...')` quietly uses an in-memory store. Read [Other Silent Behavior Changes](#other-silent-behavior-changes) before you ship.

For detailed information on each change, see the sections below.

---

## Breaking Changes

### Node.js 22.19 or Later Is Required

Every v6 package declares `"engines": { "node": ">= 22.19.0" }`. v5 had no Node.js floor for `keyv` itself, and most v5 adapters accepted Node.js 18. Update your runtime, your CI matrix, and any `engines`, `.nvmrc`, or Docker base image that pins an older version. See [Browser, Node.js, and Bun](/docs/browser-node-and-bun/) for other runtimes.

---

### Namespace Overhaul

We have finalized the transition (started in v5) to move all namespace handling to the storage adapters themselves. When you set the namespace on Keyv, it passes it directly to the storage adapter.

**What changed:**
- The `useKeyPrefix` option and property have been removed
- Key prefixing is no longer done at the Keyv layer
- A namespace set on the storage adapter is kept when Keyv has none. v5 replaced it with Keyv's namespace, `keyv` by default. A namespace passed to Keyv still wins.

**v5 (before):**
```javascript
import Keyv from 'keyv';

const keyv = new Keyv({
  namespace: 'myapp',
  useKeyPrefix: true
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

### The Default `keyv` Namespace Was Removed

In v5, a Keyv instance created without a `namespace` used the namespace `keyv`, and Keyv prefixed every key with it. `keyv.set('foo', 'bar')` handed the storage adapter the key `keyv:foo`. v6 has no default namespace and never prefixes keys, so after upgrading, `keyv.get('foo')` looks for `foo` and data written by a default v5 setup reads as missing. The v5 entries are still in your store. v6 just no longer looks for them.

To keep reading v5 data, configure v6 to build the same storage keys v5 did. For most adapters that means passing the namespace v5 used, which is `keyv` if you never set one:

```javascript
// v5: no namespace set, so `foo` was stored as `keyv:foo`
const keyv = new Keyv(store);

// v6: read the same keys
const keyv = new Keyv(store, { namespace: 'keyv' });
```

If your v5 code passed a namespace to Keyv, use that value instead of `keyv`. Pass it in Keyv's options as shown, where it takes precedence over any namespace on the adapter. v5 replaced a namespace set on the adapter with Keyv's, so the adapter's namespace was never the one v5 used.

Some v5 adapters added their own prefix on top of Keyv's, and some v5 `createKeyv` helpers turned Keyv's prefix off, so the stored key depends on the adapter and how you created it. In this table, `ns` is the namespace your v5 instance used, which is `keyv` unless you set one. "Default" means `new Keyv(store)` or `new Keyv(store, { namespace })`.

| Adapter | v5 setup | Key v5 stored for `foo` | v6 setting that reads it |
| --- | --- | --- | --- |
| SQLite, PostgreSQL, MySQL | default | `ns:foo` | Migrate the table, then `namespace: 'ns'`. SQLite migrates on connect. PostgreSQL and MySQL need their migration script. |
| Etcd | default | `ns:foo` | `namespace: 'ns'` |
| DynamoDB | default | `ns:foo` | `namespace: 'ns'` |
| DynamoDB | `createKeyv()` | `foo` | No namespace |
| Redis | default | `ns::ns:foo` | `namespace: 'ns'` with `new KeyvRedis(uri, { keyPrefixSeparator: '::ns:' })` |
| Redis | `useKeyPrefix: false`, or `createKeyv()` with a namespace | `ns::foo` | `namespace: 'ns'` |
| Redis | `createKeyv()` without a namespace | `foo` | No namespace |
| Memcache | default | `ns:ns:foo` | `namespace: 'ns:ns'` |
| Memcache | `useKeyPrefix: false` | `ns:foo` | `namespace: 'ns'` |
| Valkey | default, or `createKeyv()` | `ns:foo` | None. v6 cannot build this key, so let the entries repopulate or rename them to the v6 layout. |
| Valkey | `useRedisSets: false` | `namespace:ns:ns:foo` | `namespace: 'ns:ns'` |
| MongoDB | default | `ns:foo`, with no `namespace` field | Run the `@keyv/mongo` migration script, then `namespace: 'ns'`. |

With `useKeyPrefix: false`, the SQL, Etcd, DynamoDB, and MongoDB adapters stored plain `foo`. v6 reads it with no namespace, after the table or collection migration where the adapter has one.

If you are unsure which layout you have, look at one key in your store and choose the v6 settings that produce the same string. v6 builds storage keys like this:

- **SQLite, PostgreSQL, MySQL:** a `namespace` column and a key column.
- **MongoDB:** a `namespace` field and a `key` field, or `metadata.namespace` and `filename` with GridFS.
- **Etcd, DynamoDB, Memcache:** `<namespace>:<key>`.
- **Redis:** `<namespace><keyPrefixSeparator><key>`, where the separator defaults to `::`.
- **Valkey:** `namespace:<namespace>:<key>`, or `sets:<namespace>:<key>` with `useSets: true`.

If the data is a cache you can rebuild, you can skip all of this. The v5 entries stay in the store until they expire or you remove them. On a shared backend, keep a namespace anyway; see [`clear()` Without a Namespace Clears More](#clear-without-a-namespace-clears-more).

**Before you migrate a table or collection:**

- **Back up first.** The SQLite conversion and the PostgreSQL, MySQL, and MongoDB migration scripts rewrite your data in place. None of them can be undone.
- **SQLite converts on first connect.** The first v6 process that opens a v5 SQLite database rebuilds its table, even a test run or a one-off script. Copy the database file before you point v6 at it.
- **Stop v5 writers.** v5 and v6 can't share a store. Don't run a rolling deploy where v5 and v6 instances write to the same database at the same time.
- **Keep `checkExpired` on for converted SQLite rows.** The conversion moves each row's namespace into its own column but doesn't fill the new `expires` column. Converted rows still expire, because Keyv reads the expiry stored inside each value (`checkExpired` defaults to `true`). With `checkExpired: false`, converted rows that had a TTL never expire, and `clearExpired()` skips them until they are written again.

---

### `clear()` Without a Namespace Clears More

In v5 every Keyv instance had a namespace, `keyv` by default, so `clear()` removed only the keys that Keyv wrote. In v6 an instance with no namespace calls the adapter's `clear()` with no namespace, and some adapters then remove much more:

| Adapter | `clear()` with no namespace |
| --- | --- |
| Redis | Deletes every string key whose name doesn't contain the separator (`::` by default). With `noNamespaceAffectsAll: true`, runs `FLUSHDB`. |
| Valkey | Deletes every key in the database. |
| Etcd | Deletes every key. |
| DynamoDB | Deletes every item in the table. |
| Cloudflare KV | Deletes every key in the KV namespace. |
| Memcache | Flushes the whole server. It did this in v5 too, with or without a namespace. |
| SQLite, PostgreSQL, MySQL, MongoDB | Deletes only the rows or documents that have no namespace. |

If other data or other apps share the backend, set a namespace on every Keyv instance that calls `clear()`.

---

### `opts` Property Removed

In Keyv v5, we began removing `opts` as a passed-around value. In v6, `opts` has been removed from the Keyv class and from the `KeyvStorageAdapter` interface. The `dialect` property has also been removed. Settings are now properties on the Keyv class and on each storage adapter. `@keyv/sqlite` still has a deprecated `opts` getter for backward compatibility; don't write new code against it.

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

### Serialization Replaces `serialize` and `deserialize`

The `serialize` and `deserialize` options have been replaced with the `serialization` option. It takes a serialization adapter: an object with `stringify` and `parse` methods. A v5 `serialize` function becomes `stringify`, and `deserialize` becomes `parse`. Both still work on the `{ value, expires }` envelope. To turn serialization off, as v5 did with `keyv.serialize = undefined`, pass `serialization: false`.

In plain JavaScript, v6 ignores `serialize` and `deserialize`, so custom functions silently stop running and values are written as JSON. The built-in `KeyvJsonSerializer` writes the same format as v5's `@keyv/serialize` and v4's `json-buffer`, so the switch itself doesn't require rewriting stored data. The `@keyv/serialize` package is not part of v6; remove it from your dependencies.

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

const keyv = new Keyv(); // KeyvJsonSerializer is the default
// or
import { superJsonSerializer } from '@keyv/serialize-superjson';
const keyv = new Keyv({ serialization: superJsonSerializer });
// or keep your own functions
const keyv = new Keyv({ serialization: { stringify: mySerialize, parse: myDeserialize } });
```

See [Serialization Adapters](#serialization-adapters) for more details.

---

### Hookified for Events and Hooks

Keyv now extends [Hookified](https://hookified.org) directly, replacing the custom `EventManager` and `HooksManager` classes. This unifies the event/hook system across Keyv and all storage adapters.

**Breaking Changes:**
- `keyv.hooks.addHandler(event, fn)` is replaced by `keyv.onHook(event, fn)` or its alias `keyv.addHook(event, fn)`
- `keyv.hooks.removeHandler(event, fn)` is replaced by `keyv.removeHook({ event, handler: fn })`
- `keyv.hooks.handlers` is replaced by `keyv.hooks` (a `Map<string, IHook[]>`)
- Hook names changed from `pre`/`post` to `before:`/`after:` convention
- Hook payloads carry the key you passed (`foo`). v5 passed the prefixed key (`keyv:foo`), so code that stripped the prefix must stop
- Hooks are awaited, so a slow async hook delays the operation it belongs to
- A hook that throws now emits `error` on Keyv, so the call rejects when no `error` listener is attached. v5 emitted it on `keyv.hooks`, where it was usually ignored
- The `emitErrors` option has been removed
- Error handling changed, and the `throwOnErrors` option was removed. See [Error Handling Changed and `throwOnErrors` Was Removed](#error-handling-changed-and-throwonerrors-was-removed).

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

The old `PRE_`/`POST_` enum values are deprecated but still work. When one of them fires, Keyv emits a `warn` event such as `Hook "preSet" is deprecated: Use KeyvHooks.BEFORE_SET ('before:set') instead`. Rename them to silence the warning.

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

For more about Hookified, visit [https://hookified.org](https://hookified.org).

---

### Error Handling Changed and `throwOnErrors` Was Removed

v6 handles errors the way a Node.js `EventEmitter` does. When an operation fails, Keyv emits an `error` event:

- **With an `error` listener attached**, the listener receives the error and the operation returns a fallback value, such as `undefined` from `get` or `false` from `set`.
- **With no `error` listener attached**, the operation rejects with the error.

Every method follows this rule. The `throwOnErrors` and `emitErrors` options were removed.

**How v5 behaved:**

v5's event emitter never threw, even with no listener attached, so a listener did not change what a call returned. What happened on a failure depended on the method, and for some methods on whether the storage adapter had its own version of that method:

| v5 method | On failure |
| --- | --- |
| `set`, `setMany`, `delete`, `deleteMany`, `clear` | Emitted `error` and returned a fallback value |
| `has` | Rejected if the adapter had its own `has`. Otherwise, for example with a `Map`, emitted `error` and returned `false` |
| `hasMany` | Rejected if the adapter had its own `hasMany`. Otherwise ran `has` for each key |
| `get` | Returned `undefined` without emitting `error` |
| `getMany`, `getManyRaw` | Rejected if the adapter had its own `getMany`. Otherwise returned `undefined` for each key that failed, without emitting `error` |
| `getRaw`, `disconnect`, `iterator` | Rejected |

With `throwOnErrors: true`, `get` and the calls that emitted `error` rejected instead of returning a fallback value. `emitErrors: false` turned the `error` events off.

**What to change:**

- **To get failures back as fallback values**, as many v5 methods returned them, attach an `error` listener:

  ```javascript
  keyv.on('error', (error) => console.error('Keyv error:', error));
  ```

  A no-op listener, `keyv.on('error', () => {})`, discards errors the way `emitErrors: false` did.

- **If you used `throwOnErrors: true`**, remove it. With no `error` listener attached, failed calls reject. But errors that a storage adapter emits on its own, outside any call, are then thrown too, and nothing catches them. Redis and Memcache, for example, emit them when a connection drops. With those adapters you need a listener, and failed calls then return fallback values. v6 has no option that makes calls reject while a listener is attached.

- **Calls that rejected in v5 now return fallback values when a listener is attached.** This covers `getRaw`, `disconnect`, and `iterator`, which stops iterating, and `has`, `hasMany`, `getMany`, and `getManyRaw` on adapters that had their own versions of those methods.

- **`@keyv/redis` keeps its own `throwOnErrors` and `throwOnConnectError` options.** They are adapter options, as in `new KeyvRedis(uri, { throwOnConnectError: true })`, and are unrelated to the removed Keyv option. Keep them if you rely on them. When the adapter rejects because of one of them, it no longer also emits `error`.

See [Events and Errors](/docs/events-and-errors/) for the fallback value each method returns.

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

In plain JavaScript, `get(key, { raw: true })` doesn't fail. v6 ignores the option and returns the plain value, so code that reads `.expires` from the result gets `undefined`. In TypeScript, `getRaw` is typed `KeyvValue<T> | string | undefined`. Narrow the result before you read `.value` or `.expires` instead of casting it:

```typescript
const raw = await keyv.getRaw<string>('key');
if (raw && typeof raw === 'object') {
  console.log(raw.value, raw.expires);
}
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
- If the store does not support iteration, the generator finishes immediately without emitting an error

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

The `ttlSupport` property has been removed from storage adapters. Keyv now detects what kind of store it was given. It uses a v6 adapter as-is, wraps an older async adapter in `KeyvBridgeAdapter`, and wraps a `Map` or another synchronous Map-like store in `KeyvMemoryAdapter`, which enforces TTLs itself. See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).

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
// Keyv wraps adapters that don't declare the v6 contract in KeyvBridgeAdapter
class MyAdapter {
  // ...
}
```

---

### Storage Adapters Receive Absolute `expires` Instead of Relative `ttl`

> **Most users do not need to do anything.** The public Keyv API is unchanged — you still call `keyv.set(key, value, ttl)` with a **relative** TTL in milliseconds, and `KeyvOptions.ttl` is still relative. This change only affects authors of **custom or third-party storage adapters**.

In v5, Keyv passed each storage adapter a **relative** `ttl` (milliseconds from now) on `set`/`setMany`, and adapters re-derived the absolute deadline themselves. Some adapters even recovered the expiry by parsing the already-encoded value (`JSON.parse`), which **silently failed** under compression, encryption, or a non-JSON serializer (`@keyv/serialize-msgpackr`, `@keyv/serialize-superjson`) — leaving the expiry unset so the entry never expired.

In v6, Keyv computes the **absolute** expiry once and passes it across the storage boundary as `expires` (a Unix timestamp in milliseconds). Adapters store it directly and never parse the value to recover it.

**The v6 storage-adapter contract:**

- **`set(key, value, expires?)`** — `expires` is an absolute Unix timestamp in milliseconds. `undefined` means no expiry; a value `<= Date.now()` is already expired.
- **`setMany(entries)`** — each entry is a `KeyvStorageEntry` (`{ key, value, expires? }`) rather than the public `KeyvEntry` (`{ key, value, ttl? }`).
- **Declare support** by exposing `capabilities.expires === true`. The `keyvStorageCapability(this)` helper builds the full capability descriptor for you.

**v5 (before):**
```typescript
class MyAdapter {
  // ttl is relative milliseconds, or undefined
  async set(key: string, value: string, ttl?: number) {
    const expires = typeof ttl === 'number' ? Date.now() + ttl : undefined;
    // ...persist value with expires...
  }

  async setMany(entries: Array<{ key: string; value: string; ttl?: number }>) {
    // ...derive expires from each ttl...
  }
}
```

**v6 (after):**
```typescript
import { keyvStorageCapability, type KeyvStorageAdapter, type KeyvStorageEntry } from 'keyv';

class MyAdapter implements KeyvStorageAdapter {
  // Advertise the v6 absolute-expires contract.
  get capabilities() {
    return keyvStorageCapability(this);
  }

  // expires is an absolute Unix ms timestamp, or undefined
  async set(key: string, value: string, expires?: number) {
    // ...persist value with expires directly — no Date.now() math, no parsing...
  }

  async setMany(entries: KeyvStorageEntry[]) {
    // each entry already carries an absolute `expires`
  }
}
```

**Backward compatibility — legacy adapters keep working.** If an adapter does **not** advertise `capabilities.expires`, Keyv treats it as a v5-style adapter and automatically wraps it in `KeyvBridgeAdapter`, which converts the absolute `expires` back to a relative `ttl` before delegating to your `set`/`setMany`. So existing third-party adapters continue to function without code changes. That includes adapters whose methods return promises without being `async` functions, such as ones compiled to an older target: Keyv calls `has` once to tell them apart from a synchronous `Map`. Upgrading to the v6 contract is still recommended: it removes the bridge conversion and eliminates the silent-expiry bug described above.

**Adapters should still enforce expiry — and Keyv double-checks by default.** A v6 adapter should enforce expiry via a native server-side mechanism (e.g. Redis `PXAT`, a SQL `expires` column swept on read, a Mongo TTL index) so the backend reclaims space, and/or a client-side check on `get`. On top of that, Keyv core now filters expired reads itself by default (`checkExpired` defaults to `true`), using the absolute `expires` embedded in the serialized envelope. This is the safety net for backends whose native expiry is coarse or lazily swept — Memcached's second-granular `exptime`, or DynamoDB's background TTL sweep that can lag for hours — which would otherwise return logically-expired items. Users who want to trust the backend alone (and skip the extra decode on reads) can opt out with `checkExpired: false`.

> **Why this is better:** the absolute `expires` is computed once on the Keyv host, so it is immune to clock skew and to latency between Keyv and the store; adapters never re-parse encoded values; and the silent-expiry bug under compression/encryption/alternate serializers is gone. See the per-adapter "Expiration and TTL" notes (for example, [`@keyv/redis`](https://github.com/jaredwray/keyv/tree/main/storage/redis#expiration-and-ttl)) for backend-specific details.

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

Compression adapters now implement the `KeyvCompressionAdapter` interface. Both methods take a string and resolve to a string:

```typescript
type KeyvCompressionAdapter = {
  compress(value: string): Promise<string>;
  decompress(value: string): Promise<string>;
};
```

v6 compresses the whole serialized entry, `expires` included, and stores the result as base64. The v5 adapters' `serialize`, `deserialize`, and `opts` members are gone.

**Data compressed by v5 can't be read by v6.** v5 compressed only the `value` field inside a JSON envelope, and v6 expects the whole entry to be compressed. Reading a v5 entry fails with a decompression error, such as `incorrect header check` from `@keyv/compress-gzip`. Keyv emits `error`, and the call returns `undefined` when a listener is attached or rejects when none is. Treat a compressed v5 store as a cache that v6 repopulates, or read the old entries with v5 and write them again with v6.

**Important:** Compression and encryption only run when serialization is enabled, which is the default. With `serialization: false`, Keyv stores values as they are, without compressing or encrypting them.

**v6 usage:**
```javascript
import Keyv from 'keyv';
import KeyvGzip from '@keyv/compress-gzip';

const compression = new KeyvGzip();
const keyv = new Keyv({ compression });

// Serialization is enabled by default (built-in KeyvJsonSerializer)
await keyv.set('key', { foo: 'bar' });
```

---

### Other Silent Behavior Changes

These changes don't cause compile errors, and most of them don't throw. Check your code for each one:

- **A connection string is ignored.** `new Keyv('redis://localhost:6379')` and `new Keyv({ uri: 'redis://localhost:6379' })` don't load an adapter. v6 quietly uses an in-memory store, and TypeScript accepts both forms. Pass an adapter instead: `new Keyv(new KeyvRedis('redis://localhost:6379'))`.
- **Removed options are ignored.** In plain JavaScript, `serialize`, `deserialize`, `useKeyPrefix`, `emitErrors`, and `throwOnErrors` have no effect.
- **`keyv.store` returns the wrapper.** For a `Map` or an older adapter, `keyv.store` is the `KeyvMemoryAdapter` or `KeyvBridgeAdapter` that Keyv created, and the object you passed in is at `keyv.store.store`. v5 returned your object.
- **A `Map` holds different entries.** A `Map` store now holds `{ value, expires }` objects under `namespace:key`, or under the bare key when there is no namespace. v5 stored serialized strings under `keyv:key`. Code that reads the `Map` directly must change.
- **Array results are always truthy.** `deleteMany` and `delete([...])` return `boolean[]`, so `if (await keyv.deleteMany(keys))` is always true. Check `results.every(Boolean)` instead.
- **A TTL of zero or less means no TTL.** v5 treated only `0` that way. Fractional TTLs are rounded up to the next millisecond.
- **Empty-string keys are rejected.** `set('', value)` and `delete('')` return `false`, and `get('')` returns `undefined`.
- **Symbols can't be stored.** `set(key, Symbol())` emits `error`, so it rejects when no listener is attached and returns `false` when one is.
- **`has()` reads the value.** With `checkExpired` on, which is the default, `has` reads and decodes the entry so it can skip expired values.
- **Stats count per key.** `getMany(['a', 'b'])` now records a hit or miss for each key, not one for the call. A failed read counts as an error, not a miss. The v5 `StatsManager` methods `hit()`, `miss()`, `set()`, `delete()`, and `hitsOrMisses()` were removed.
- **Some exports were removed.** `CompressionAdapter`, `Serialize`, `Deserialize`, `StoredData`, `StoredDataNoRaw`, and `StoredDataRaw` are gone, and `IEventEmitter` now comes from `hookified`. `KeyvStoreAdapter`, `DeserializedData`, and `KeyvCompression` remain as deprecated aliases of `KeyvStorageAdapter`, `KeyvValue`, and `KeyvCompressionAdapter`.

---

### `@keyv/test-suite` API Changes

If you maintain a storage adapter, update its tests:

- The package has no default export. Import the suites by name.
- The first argument is Vitest's `test` (or `it`) function. v5 took the whole `vitest` module.
- `keyvNamespaceTest` is now `keyvNamespaceTests`, and `keyvCompresstionTests` is now `compressionTestSuite`.
- New suites test the adapter directly, without Keyv: `storageTestSuite` runs `storageBasicTests`, `storageBatchTests`, `storageIteratorTests`, `storageTtlTests`, `storageNamespaceTests`, and `storageDisconnectTests`.

```javascript
import { keyvTestSuite, storageTestSuite } from '@keyv/test-suite';
import { Keyv } from 'keyv';
import { test } from 'vitest';
import MyAdapter from './src/index.js';

const store = () => new MyAdapter();
keyvTestSuite(test, Keyv, store);
storageTestSuite(test, store);
```

---

### Libraries That Embed Keyv v5

Some libraries depend on Keyv v5 and take Keyv instances or adapters from your code. For example, `cache-manager` 7, `cacheable` 2, `@cacheable/memory`, and `cacheable-request` 13 all depend on `keyv` `^5.6.0`. Mixing them with v6 breaks quietly:

- **A v6 `Keyv` passed to a v5 library.** `cache-manager` calls `store.get(key, { raw: true })` and reads `.expires`. v6 ignores `raw`, so `ttl()` and the refresh logic in `wrap()` stop working.
- **A v6 adapter used by a v5 `Keyv`.** A v5 Keyv passes a relative `ttl` where a v6 adapter expects an absolute `expires` timestamp, so entries expire at the wrong time, usually at once.

Check which Keyv version a library needs with `npm view <package> dependencies.keyv peerDependencies.keyv`. Keep the Keyv instances and adapters you pass to such a library on v5 until it supports v6. If `keyv` appears in your project only as a dependency of another package, you have nothing to migrate. Don't force v6 onto that package with `overrides` or `resolutions`.

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

### `@keyv/etcd` Default `ttl` Applies Per Key

In v5, the `ttl` option of `@keyv/etcd` created one etcd lease when the store was constructed, and every key written without an expiry was attached to it. The lease started counting at the first write and was never renewed, so every key on it was deleted when it expired, no matter when that key was written. After that, writes without an expiry failed because the lease no longer existed.

In v6, `ttl` applies to each key written without an expiry, counted from that write, and each such key gets its own lease. `ttl` can also be changed on the store at any time.

**What this means for you:**
- If you set `ttl` on the store, keys now live for `ttl` from their own write, and writes keep working after the first `ttl` has passed
- The `lease` property is removed. Remove any code that reads or assigns `store.lease`

---

### `@keyv/dynamo` Keys Without a TTL No Longer Expire

In v5, `@keyv/dynamo` gave every key written without a TTL an expiry six hours after the write, and DynamoDB's TTL process deleted the key some time after that. No other adapter expires keys that were written without a TTL.

In v6, a key written without a TTL has no expiry and is kept until it is deleted. The `sixHoursInMilliseconds` property is removed.

**What this means for you:**
- To give keys a default expiry, set Keyv's `ttl` option, such as `new Keyv(store, { ttl: 6 * 60 * 60 * 1000 })`
- Remove any code that reads or assigns `store.sixHoursInMilliseconds`
- A key written by v5 keeps the expiry it was written with until it is written again

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
@keyv/serialize-superjson: 6.0.0
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

The default serializer is the built-in `KeyvJsonSerializer`. The property is `serialization`.

```javascript
import Keyv from 'keyv';

const keyv = new Keyv(); // default JSON serializer

import { superJsonSerializer } from '@keyv/serialize-superjson';
keyv.serialization = superJsonSerializer;
```

**Available Serialization Adapters:**

| Package | Description |
|---------|-------------|
| `KeyvJsonSerializer` (built-in) | **Default** — JSON plus `Buffer` and `BigInt` |
| `@keyv/serialize-superjson` | `Date`, `Map`, `Set`, `RegExp`, `URL`, `Error`, `undefined` |
| `@keyv/serialize-msgpackr` | High-performance binary MessagePack |

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

Create your own serialization adapter with the `KeyvSerializationAdapter` type. Either method may return a promise:

```typescript
type KeyvSerializationAdapter = {
  stringify: (object: unknown) => string | Promise<string>;
  parse: <T>(data: string) => T | Promise<T>;
};
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
| `@keyv/encrypt-node` | Node.js `crypto` (AES-GCM, ChaCha20-Poly1305, AES-CBC, …) |
| `@keyv/encrypt-web` | Web Crypto API for browsers, Workers, and Deno |

```javascript
import Keyv from 'keyv';
import KeyvEncryptNode from '@keyv/encrypt-node';

const encryption = new KeyvEncryptNode({ key: 'your_secret_key_here' });
const keyv = new Keyv({ encryption });

await keyv.set('sensitive', { password: 'secret' });
```

#### Custom Encryption

Create your own encryption adapter with the `KeyvEncryptionAdapter` type. Either method may return a promise:

```typescript
type KeyvEncryptionAdapter = {
  encrypt: (data: string) => string | Promise<string>;
  decrypt: (data: string) => string | Promise<string>;
};
```

> **Note:** Encryption runs on the serialized string, so it only works while `serialization` is enabled, which is the default.

---

### New Identification Functions

Keyv v6 provides `detect*` helpers (these replaced the earlier `isKeyv` / `isKeyvStorage` names). See [Detect Capabilities](/docs/detect-capabilities/).

#### `detectKeyv`

```javascript
import Keyv, { detectKeyv } from 'keyv';

detectKeyv(new Keyv()).compatible; // true
detectKeyv(new Map()).compatible;   // false
```

#### `detectKeyvStorage`

```javascript
import { detectKeyvStorage } from 'keyv';

detectKeyvStorage(new Map()).store; // 'mapLike'
```

#### Compression, serialization, encryption

```javascript
import { detectKeyvCompression, detectKeyvSerialization, detectKeyvEncryption } from 'keyv';

detectKeyvCompression(gzipAdapter).compatible;
detectKeyvSerialization(JSON).compatible;
detectKeyvEncryption(aesAdapter).compatible;
```

---

### Memory Adapter

Keyv v6 includes `KeyvMemoryAdapter`, a wrapper class for storage types that don't conform to v6 storage adapter requirements (such as `Map`-compatible or legacy adapters).

**Features:**
- Handles namespacing using key prefixing
- Adds the v6 batch methods the store lacks: `getMany`, `setMany`, `hasMany`, and `deleteMany`
- Attempts iteration using various strategies
- Adds TTL support and handles expiration

Older async adapters go through `KeyvBridgeAdapter` instead. See [Legacy Storage Adapters](/docs/legacy-storage-adapters/).

```javascript
import Keyv, { detectKeyvStorage } from 'keyv';

// Map-compatible stores are automatically wrapped
const yourStore = new Map();
const keyv = new Keyv({ store: yourStore });

// Check if your adapter will use KeyvMemoryAdapter
const capabilities = detectKeyvStorage(yourStore);
if (capabilities.store === 'mapLike') {
  console.log('This store will use KeyvMemoryAdapter');
}
```

---

## Getting Help

If you encounter issues during migration:

1. Check the [Keyv documentation](https://keyv.org)
2. Search [existing issues](https://github.com/jaredwray/keyv/issues)
3. Open a [new issue](https://github.com/jaredwray/keyv/issues/new) with details about your migration problem
