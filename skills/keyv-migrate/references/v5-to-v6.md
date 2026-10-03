# v5 to v6 changes

Core `keyv` changes, with the fix for each. A v4 project applies [v4-to-v5.md](v4-to-v5.md) first. Adapter-specific changes are in [adapters.md](adapters.md).

## Namespace

v5 used `keyv` as the namespace when none was set and prefixed every key with it. v6 has no default and never prefixes keys; each adapter handles its own `namespace`. The `useKeyPrefix` option and property are gone. Choose the namespace from the stored-data decision in [stored-data.md](stored-data.md), and pass it in Keyv's options:

```js
// v5: keys stored as keyv:foo
const keyv = new Keyv(store);

// v6: read the same keys (the exact settings depend on the adapter)
const keyv = new Keyv(store, { namespace: 'keyv' });
```

A namespace passed to Keyv takes precedence over one set on the adapter. When Keyv has none, the adapter keeps its own.

These forms all still work: `new Keyv(store, options)`, `new Keyv({ store, ...options })`, and in ESM both `import Keyv from 'keyv'` and `import { Keyv } from 'keyv'`. Only the options changed.

## `opts`

`keyv.opts` is gone, and so are the `opts` and `dialect` properties on adapters. Read the property directly: `keyv.namespace`, `keyv.ttl`, `keyv.store`, `keyv.serialization`, `keyv.compression`, `keyv.encryption`, `keyv.stats`, `keyv.sanitize`, and `keyv.checkExpired` (read-only). `@keyv/sqlite` keeps a deprecated `opts` getter; don't write new code against it.

## Serialization

The `serialize` and `deserialize` options became one `serialization` option that takes an adapter with `stringify` and `parse`. Both still work on the `{ value, expires }` envelope. In JavaScript, v6 ignores the old options, so custom functions silently stop running.

```js
// v5
new Keyv({ serialize: mySerialize, deserialize: myDeserialize });
keyv.serialize = undefined;      // turned serialization off

// v6
new Keyv({ serialization: { stringify: mySerialize, parse: myDeserialize } });
new Keyv({ serialization: false });
```

If the functions were `JSON.stringify` and `JSON.parse`, or wrappers of `@keyv/serialize`, remove them: the built-in `KeyvJsonSerializer` is the default and writes the format v4 and v5 wrote. `@keyv/serialize-superjson` (`superJsonSerializer`) and `@keyv/serialize-msgpackr` (`msgpackrSerializer`) are optional alternatives, but they don't read data the JSON serializer wrote.

Compression and encryption only run while serialization is on. With `serialization: false`, values are stored as they are, uncompressed. With an encryption adapter set, writes fail with an error instead, so keep serialization on when you encrypt.

## Errors

v5's emitter never threw. Some methods emitted `error` and returned a fallback value, and others rejected. v6 applies one rule to every method:

- **With an `error` listener attached**, the listener gets the error and the call returns a fallback value (`get` → `undefined`, `set` → `false`, `has` → `false`, and so on).
- **With no `error` listener**, the call rejects.

Keyv also re-emits every `error` event its adapter emits, so a listener on the adapter alone doesn't help: Keyv emits the error again, and with no listener on Keyv, that throws.

The `throwOnErrors` and `emitErrors` options are gone, and no v6 option makes calls reject while a Keyv `error` listener is attached. Decide from what the app relied on:

- **Failures as fallback values** (most v5 apps): attach a listener, as in `keyv.on('error', (error) => logger.error(error))`. A no-op listener discards errors the way `emitErrors: false` did.
- **Failures as rejections** (v5 `throwOnErrors: true`, and every v4 app; see [v4-to-v5.md](v4-to-v5.md#errors)):
  - With a store that can't fail on its own, such as a `Map` or SQLite, leave the listener off, and calls reject as before.
  - With a network adapter (Redis, Valkey, Memcache, MongoDB, PostgreSQL, MySQL, Etcd, DynamoDB), connection errors can arrive outside any call, and with no listener they are thrown and can crash the process. You can't have both, so tell the user and let them choose: either leave the listener off and accept the crash risk, or attach a listener and have callers check results (`set` returns `false`; a failed `get` returns `undefined`, the same as a miss, so record failures in the listener if callers must tell them apart).

`@keyv/redis` still has its own `throwOnErrors` (default `false`) and `throwOnConnectError` (default `true`) options. They belong to `new KeyvRedis(uri, options)`. They decide whether the adapter rejects or emits, but Keyv then applies the rule above either way. Keep them as they were.

Methods that rejected in v5 (`getRaw`, `disconnect`, `iterator`, and `has`, `hasMany`, `getMany`, `getManyRaw` on adapters that had their own) now return fallback values when a listener is attached.

## Hooks

Keyv extends Hookified. `keyv.hooks` is a `Map`.

```js
// v5
keyv.hooks.addHandler(KeyvHooks.PRE_SET, handler);
keyv.hooks.removeHandler(KeyvHooks.PRE_SET, handler);

// v6
keyv.onHook(KeyvHooks.BEFORE_SET, handler);          // addHook is an alias
keyv.removeHook({ event: KeyvHooks.BEFORE_SET, handler });
```

| v5 | v6 |
| --- | --- |
| `PRE_SET` (`preSet`), `POST_SET` (`postSet`) | `BEFORE_SET` (`before:set`), `AFTER_SET` (`after:set`) |
| `PRE_GET`, `POST_GET` | `BEFORE_GET`, `AFTER_GET` |
| `PRE_GET_MANY`, `POST_GET_MANY` | `BEFORE_GET_MANY`, `AFTER_GET_MANY` |
| `PRE_GET_RAW`, `POST_GET_RAW`, `PRE_GET_MANY_RAW`, `POST_GET_MANY_RAW` | `BEFORE_`/`AFTER_` versions |
| `PRE_SET_RAW`, `POST_SET_RAW`, `PRE_SET_MANY_RAW`, `POST_SET_MANY_RAW` | `BEFORE_`/`AFTER_` versions |
| `PRE_DELETE`, `POST_DELETE` | `BEFORE_DELETE`, `AFTER_DELETE` |

The old names still fire but emit a `warn` event each time; rename them. v6 also has hooks for `SET_MANY`, `DELETE_MANY`, `HAS`, `HAS_MANY`, `CLEAR`, and `DISCONNECT`.

Hook behavior changed too:

- The payload's key is the key the caller passed (`foo`), not the prefixed key (`keyv:foo`). Remove code that strips a prefix.
- Hooks are awaited, so a slow async hook delays the operation.
- A hook that throws emits `error` on Keyv, so the call rejects when no listener is attached.

Events: `error`, `clear`, and `disconnect` work as before. v6 adds `warn`, `info`, and `stat:hit`, `stat:miss`, `stat:set`, `stat:delete`, `stat:error`.

## Raw values

`get` and `getMany` ignore `{ raw: true }` in v6 and return plain values.

```js
// v5
const raw = await keyv.get('key', { raw: true });
const raws = await keyv.getMany(['a', 'b'], { raw: true });

// v6
const raw = await keyv.getRaw('key');         // { value, expires } or undefined
const raws = await keyv.getManyRaw(['a', 'b']);
```

In TypeScript, `getRaw` returns `KeyvValue<T> | string | undefined`. Narrow it (`if (raw && typeof raw === 'object')`) instead of casting. `expires` is `undefined` when there is no TTL. v6 also adds `setRaw` and `setManyRaw`.

## Return values

- `deleteMany(keys)` and `delete(keys)` with an array return `boolean[]`, one entry per key, so `if (await keyv.deleteMany(keys))` is always true. `delete(key)` with a single key still returns a boolean. Use `.some(Boolean)` if the code meant "at least one key was deleted" and `.every(Boolean)` if it meant "every key was deleted". The old result depended on the adapter: SQLite, PostgreSQL, MySQL, and MongoDB returned `true` when any key was deleted, while a `Map`, Memcache, and Etcd returned `true` only when all were. Redis depended on the `@keyv/redis` version: 2.7 through 3.0 returned `true` only when all were, and earlier and later versions when any was. With an empty list, v6 returns `[]`: `.every` gives `true` and `.some` gives `false`.
- `setMany(entries)` takes `{ key, value, ttl? }[]` and returns `boolean[]`.
- `set` returns `boolean`.
- Missing values are always `undefined`, never `null`.

## Iterator

`keyv.iterator()` is now a method that always exists and takes no arguments. It yields `[key, value]` pairs without the namespace prefix, skips expired entries, and ends at once when the store can't iterate. The `IteratorFunction` type is gone.

```js
// v5
for await (const [key, value] of keyv.iterator(keyv.namespace)) {}

// v6
for await (const [key, value] of keyv.iterator()) {}
```

## Store wrappers

Keyv v6 wraps stores it doesn't use directly:

- A `Map` or another synchronous Map-like store goes in a `KeyvMemoryAdapter`. It now holds `{ value, expires }` objects under `namespace:key`, or under the bare key with no namespace. v5 stored serialized strings under `keyv:key`. With the default serializer, the stored `value` is a JSON string, so `get` still returns a copy, as in v4 and v5. With `serialization: false`, and with `createKeyv` from `keyv`, the object itself is stored and `get` returns the same reference.
- An older async adapter that doesn't declare the v6 contract goes in a `KeyvBridgeAdapter`.

With a namespace, `clear()` on a wrapped store deletes only that namespace's entries; v5 called the store's own `clear()`, which deleted everything. Finding them takes `keys()` on a Map-like store or `iterator()` on an async one, unless an older adapter manages its own namespace. Without that, `clear()` deletes nothing and fails with `error`. Add the method, or call `clear()` on an instance without a namespace to empty the store.

`keyv.store` returns the wrapper, and the object you passed is at `keyv.store.store`. Fix code that compares `keyv.store` with the original object or reads the `Map` directly.

A string, `{ uri }`, or anything else Keyv can't use as a store also ends up in a `KeyvMemoryAdapter`. That is how a leftover connection string fails silently.

## Smaller changes

- **TTL.** A TTL of zero or less means no TTL (v5: only `0`). Fractional TTLs are rounded up. `set(key, value, ttl)` and the `ttl` option are still relative milliseconds.
- **Empty keys.** `set('', v)` and `delete('')` return `false`; `get('')` returns `undefined`.
- **Symbols.** `set(key, Symbol())` emits `error` (rejects with no listener, returns `false` with one).
- **`has()`** reads and decodes the entry while `checkExpired` is on (the default), so it skips expired entries.
- **`checkExpired`** is a new option, `true` by default. It drops expired entries on read, even if the backend returns them. Keep it on for data migrated from SQLite (see [stored-data.md](stored-data.md)).
- **Stats** count per key, so `getMany(['a', 'b'])` records two hits or misses. A failed read counts as an error, not a miss. `KeyvStats` has `hits`, `misses`, `sets`, `deletes`, `errors`, per-key maps such as `hitKeys`, and `reset()`. The v5 methods `hit()`, `miss()`, `set()`, `delete()`, and `hitsOrMisses()` are gone.
- **`sanitize`** is a new option that cleans keys and namespaces. It is off by default.
- **`createKeyv`** in `keyv` builds a Keyv over a `KeyvMemoryAdapter` with serialization off. Adapter packages export their own `createKeyv`.
- **Detection helpers.** `detectKeyv`, `detectKeyvStorage`, `detectKeyvCompression`, `detectKeyvSerialization`, and `detectKeyvEncryption` are new. No published v5 had `isKeyv`.

## Removed and renamed exports

| v5 | v6 |
| --- | --- |
| `StoredData`, `StoredDataRaw`, `StoredDataNoRaw` | `KeyvValue<T>` for `{ value, expires }` |
| `DeserializedData` | `KeyvValue` (deprecated alias still exported) |
| `KeyvStoreAdapter` | `KeyvStorageAdapter` (deprecated alias still exported) |
| `CompressionAdapter`, `KeyvCompression` | `KeyvCompressionAdapter` (`KeyvCompression` is a deprecated alias) |
| `Serialize`, `Deserialize` | `KeyvSerializationAdapter` |
| `IEventEmitter` | import it from `hookified` |
| `IteratorFunction` | none; use `keyv.iterator()` |

## Adapter interfaces

```ts
type KeyvSerializationAdapter = {
  stringify: (object: unknown) => string | Promise<string>;
  parse: <T>(data: string) => T | Promise<T>;
};

type KeyvCompressionAdapter = {
  compress(value: string): Promise<string>;
  decompress(value: string): Promise<string>;
};

type KeyvEncryptionAdapter = {
  encrypt: (data: string) => string | Promise<string>;
  decrypt: (data: string) => string | Promise<string>;
};
```

The order is serialize, then compress, then encrypt on write, and the reverse on read. Custom storage adapters are covered in [custom-adapters.md](custom-adapters.md).
