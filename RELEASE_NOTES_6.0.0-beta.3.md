# Keyv v6.0.0-beta.3

This release rolls up the entire v6 beta cycle — everything merged since `v6.0.0-alpha.3`. v6 is a major, ground-up modernization of Keyv: a leaner core, a new raw-data API, first-class capability detection, telemetry, two new encryption packages, a dependency-free etcd adapter, and a wave of breaking dependency upgrades across the monorepo.

> **Heads up:** v6 contains a number of breaking changes vs. v5. If you are upgrading from v5, read the [v5 → v6 migration guide](https://github.com/jaredwray/keyv/blob/main/website/site/docs/migration.md) alongside these notes.

---

## Highlights

- 🔐 **Two new encryption packages** — `@keyv/encrypt-node` (Node.js `crypto`) and `@keyv/encrypt-web` (Web Crypto API), with a shared wire format so they're cross-compatible.
- 🧩 **Raw data API** — `getRaw` / `getManyRaw` / `setRaw` / `setManyRaw` for working directly with the stored `{ value, expires }` envelope.
- 🔎 **Capability detection** — `detectKeyv`, `detectKeyvStorage`, `detectKeyvCompression`, `detectKeyvSerialization`, `detectKeyvEncryption` helpers.
- 📊 **Stats / telemetry overhaul** — aggregate counters plus LRU-bounded per-key frequency maps.
- 🧼 **Key sanitization** — opt-in protection against SQL/Mongo/path-traversal/control-character injection in keys and namespaces.
- 🪝 **Hookified everywhere** — unified events + pre/post hooks across the core and every adapter, now including `setMany`, `deleteMany`, `clear`, and `disconnect`.
- 🌐 **Dependency-free etcd adapter** — talks to etcd v3 over its HTTP/JSON gateway via an in-house client (no `etcd3`).
- ⚙️ **Optional serialization** and **no key-prefixing in core** for a smaller, faster default path.
- 🏗️ **Build & toolchain modernization** — moved to `tsdown`, TypeScript 6, and a refreshed release pipeline (OIDC publishing).
- 📦 **Major dependency upgrades** across Redis, MongoDB, MySQL, Postgres, DynamoDB, msgpackr, hookified, hashery, and more.

---

## ⚠️ Breaking Changes

### Core

- **`StoredData` and `StoredDataRaw` types removed.** Use the `KeyvValue<T>` envelope (`{ value, expires? }`) and the new raw API instead. (#1929)
- **Keys are no longer prefixed in core.** Namespacing/prefixing is now handled by the storage adapters that need it, not the core. (#1899)
- **`get` no longer checks expiry by default.** Expiration is evaluated lazily/where appropriate to keep the hot path fast; expired entries still resolve to `undefined` through the normal read paths. (#1923)
- **Moved to [Hookified](https://github.com/jaredwray/hookified) for events + hooks.** Replaces the old `EventEmitter` base across core and adapters. (#1900)
- **`.set()` now returns a boolean** instead of the instance. (#1904)
- **Iterator API simplified** and various method signatures cleaned up. (#1902)
- **`setRaw` / `setManyRaw` no longer take a `ttl` argument** — set `expires` on the value envelope instead. (#1905)
- **`opts` removed from `KeyvStorageAdapter`** and the `opts` property removed from the `Keyv` class. (#1906)

### Adapters & tooling (dependency bumps that change minimums)

- **`@redis/client` upgraded to v6** (breaking). (#1954)
- **hookified upgraded to v3** (breaking) across the monorepo. (#1957)
- **hashery upgraded to v2** in BigMap (breaking). (#1956)
- **msgpackr upgraded to v2** in `@keyv/serialize-msgpackr` (breaking). (#1958)
- **bignumber.js upgraded to v11** in the test-suite (breaking). (#1955)
- **docula upgraded to v2** for the website (breaking). (#1947)
- **Code-quality deps, GitHub Actions, and build tooling** upgraded (some breaking minimum versions). (#1944, #1946, #1945)
- **TypeScript 6** is now used to build the monorepo. (#1933)
- **test-suite v6 overhaul** — compliance tests rewritten for the v6 API. If you maintain a third-party adapter against `@keyv/test-suite`, expect changes. (#1931)

---

## 🔐 New: Encryption Packages

Two new adapters let you encrypt values transparently. They share a wire format, so data written by one can be read by the other (same key + algorithm).

### `@keyv/encrypt-node` — Node.js `crypto`

Supports AES-GCM (default), AES-CCM, ChaCha20-Poly1305, AES-CBC, and any cipher available in your Node install. (#1927)

```js
import Keyv from 'keyv';
import KeyvEncryptNode from '@keyv/encrypt-node';

const encryption = new KeyvEncryptNode({ key: 'your-secret-key' });
const keyv = new Keyv({ encryption });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar' (decrypted automatically)
```

```js
// Pick an algorithm and output encoding
const encryption = new KeyvEncryptNode({
  key: 'your-secret-key',
  algorithm: 'chacha20-poly1305',
  encoding: 'hex',
});
```

### `@keyv/encrypt-web` — Web Crypto API

Works in browsers, Deno, Cloudflare Workers, and Node.js 18+ with no Node-specific dependencies. Supports AES-GCM (recommended) and AES-CBC. (#1928)

```js
import Keyv from 'keyv';
import KeyvEncryptWeb from '@keyv/encrypt-web';

const encryption = new KeyvEncryptWeb({ key: 'your-secret-key' });
const keyv = new Keyv({ encryption });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar'
```

**Cross-compatibility wire format** (same for both packages):

- **AES-GCM:** `base64([IV (12 bytes) || AuthTag (16 bytes) || Ciphertext])`
- **AES-CBC:** `base64([IV (16 bytes) || Ciphertext])`

---

## 🧩 Core: Raw Data API

Work directly with the stored envelope (`{ value, expires? }`) — useful for replication, cache warming, and moving data between stores. (#1897, #1929)

```js
import Keyv from 'keyv';
const keyv = new Keyv();

// Write a raw envelope with an absolute expiry timestamp
await keyv.setRaw('foo', { value: 'bar', expires: Date.now() + 60_000 });

// No expiry
await keyv.setRaw('foo', { value: 'bar' });

// Read the raw envelope back
const raw = await keyv.getRaw('foo'); // { value: 'bar', expires: 1234567890 }

// Copy between instances without unwrapping/rewrapping
if (raw) {
  await other.setRaw('foo', raw);
}

// Batch variants
await keyv.setManyRaw([
  { key: 'a', value: { value: 1 } },
  { key: 'b', value: { value: 2, expires: Date.now() + 60_000 } },
]);
const many = await keyv.getManyRaw(['a', 'b']);
```

> The store-level TTL is derived automatically from `value.expires`, so you no longer pass a separate `ttl` to the raw setters.

---

## 🔎 Core: Capability Detection

New helpers report exactly which parts of an interface an object implements. Each returns per-capability booleans plus a top-level flag that is `true` only when the full interface is satisfied. (#1909, #1930)

```ts
import Keyv, {
  detectKeyv,
  detectKeyvStorage,
  detectKeyvCompression,
  detectKeyvSerialization,
  detectKeyvEncryption,
} from 'keyv';

detectKeyv(new Keyv()).keyv; // true
detectKeyv(new Map()).keyv;  // false (but get/set/... still reported true)

// Storage detection also reports map-likeness and sync/async per method
const r = detectKeyvStorage(new Map());
r.mapLike;            // true
r.methodTypes.get;    // "sync"

detectKeyvSerialization(JSON).keyvSerialization;                      // true
detectKeyvCompression({ compress: d => d, decompress: d => d });      // { keyvCompression: true, ... }
detectKeyvEncryption({ encrypt: d => d, decrypt: d => d });           // { keyvEncryption: true, ... }
```

---

## 📊 Core: Stats / Telemetry

Opt-in statistics with aggregate counters and LRU-bounded per-key frequency maps. (#1912)

```js
const keyv = new Keyv({ stats: true });

await keyv.set('foo', 'bar');
await keyv.get('foo');          // hit
await keyv.get('nonexistent');  // miss
await keyv.delete('foo');

keyv.stats.hits;    // 1
keyv.stats.misses;  // 1
keyv.stats.sets;    // 1
keyv.stats.deletes; // 1

// Per-key frequency (each map capped at maxEntries, default 1000)
keyv.stats.hitKeys.get('foo');           // 1
keyv.stats.missKeys.get('nonexistent');  // 1

keyv.stats.reset();          // clears counters and maps
keyv.stats.enabled = false;  // disable at runtime (auto-unsubscribes)
```

---

## 🧼 Core: Key Sanitization

Opt-in detection that strips dangerous *patterns* (not harmless characters) from keys and namespaces — guarding against SQL injection, MongoDB operator injection, path traversal, and control-character/CRLF attacks. Results are LRU-cached for speed.

```js
const keyv = new Keyv({ sanitize: true });
// or fine-grained:
const keyv2 = new Keyv({ sanitize: { sql: true, mongo: true, path: true, escape: true } });
```

Applied to every key-accepting method (`get`, `set`, `delete`, `has`, the `*Many` variants, and the raw variants), plus namespaces at construction and on the `namespace` setter.

---

## 🪝 Core: Events, Hooks & Error Handling

- **Hooks for more operations** — added pre/post hooks for `setMany`, `deleteMany`, `clear`, and `disconnect`, in addition to the existing single-key hooks. (#1918, #1924)
- **`throwOnErrors`** — make operations throw instead of emitting `'error'`, so you can `try/catch` (great with `@keyv/redis` connection handling). (#1910)

  ```js
  import Keyv from 'keyv';
  import KeyvRedis from '@keyv/redis';

  const keyv = new Keyv({ store: new KeyvRedis('redis://localhost:6379'), throwOnErrors: true });
  try {
    await keyv.set('foo', 'bar');
  } catch (error) {
    // handle connection/timeout errors yourself
  }
  ```

- **`emitErrors`** — set to `false` to suppress the `'error'` event entirely. (#1910)
- **`useKeyPrefix`** — toggle key prefixing on the instance (prefixing now lives in adapters, not core). (#1899)

  ```js
  const keyv = new Keyv({ useKeyPrefix: false });
  keyv.useKeyPrefix = true; // can be flipped at runtime
  ```

- **Encode/decode now propagate errors** instead of swallowing them, and several stats/telemetry edge cases were fixed (no `STAT_SET` on empty set, `setRaw` telemetry, `getManyRaw` dead code). (#1922, #1920, #1921, #1919)

---

## ⚙️ Core: Optional Serialization

Serialization is now optional. Disable it to store raw objects (ideal for the default in-memory `Map`, where string conversion isn't needed). (#1898)

```js
const keyv = new Keyv({ serialization: false });
```

Pipeline ordering when serialization/compression are configured:

- **On set:** serialize (optional) → compress (optional) → store
- **On get:** store → decompress (optional) → parse (optional) → value

If compression is configured without a serializer, Keyv falls back to `JSON.stringify`/`JSON.parse` since compression needs string input.

---

## 🌐 Storage Adapters

- **etcd: dependency-free client.** `@keyv/etcd` now talks to etcd v3 directly over its HTTP/JSON gateway via a small in-house client — the `etcd3` dependency is gone. Requires etcd v3+ and Node.js 20+ (uses global `fetch` / `AbortSignal.timeout`). TTL via etcd leases, namespace isolation, async iterator, and `setMany`/`getMany`/`deleteMany`/`hasMany` are all supported. (#1936, #1893)
- **DynamoDB:** added `disconnect()` and `iterator()`; moved to v6 requirements with namespace support; TTL now stored in milliseconds; internal `isExpired` rename. AWS SDK dependencies upgraded. (#1914, #1894, #1934, #1935, #1948)
- **Compression adapters** moved to the `KeyvCompressionAdapter` standard. (#1901)
- **BigMap:** optimized hash function and hot-path performance. (#1915)
- **Adapter dependency upgrades:** MongoDB (#1951), MySQL/mysql2 (#1952), Postgres/pg (#1953), memcache (#1950).

---

## 🏗️ Build, Tooling & Release

- Moved the monorepo build to **`tsdown`**. (#1926)
- Upgraded to **TypeScript 6**. (#1933)
- New **release management with OIDC** and multi-version publishing, plus a hardened release pipeline. (#1942)
- **test-suite:** v6 compliance overhaul, and TTL tests can now specify milliseconds or seconds. (#1931, #1949)
- **Stability:** hardened service-backed test suites against timing flakes. (#1960)
- **Docs/links:** fixed `main`-vs-`master` links and broken logo links in package READMEs. (#1939, #1943)

---

## 📦 Notable Dependency Upgrades

| Package | Change | PR |
|---|---|---|
| `@redis/client` | → v6 (breaking) | #1954 |
| `hookified` | → v3 (breaking) | #1957 |
| `hashery` (BigMap) | → v2 (breaking) | #1956 |
| `msgpackr` (serialize) | → v2 (breaking) | #1958 |
| `bignumber.js` (test-suite) | → v11 (breaking) | #1955 |
| `docula` (website) | → v2 (breaking) | #1947 |
| `mongodb` | upgraded | #1951 |
| `mysql2` | upgraded | #1952 |
| `pg` | upgraded | #1953 |
| AWS SDK (dynamo) | upgraded | #1948 |
| memcache | upgraded | #1950 |
| TypeScript | → v6 | #1933 |
| GitHub Actions | upgraded (breaking) | #1946 |

---

## Full Changelog by Release

### Since `v6.0.0-beta.1`
- `mono` - test: harden service-backed suites against timing flakes (#1960)
- `serialize-msgpackr` - chore: upgrade msgpackr to v2 (breaking) (#1958)
- `mono` - chore: upgrade hookified to v3 (breaking) (#1957)
- `bigmap` - chore: upgrade hashery to v2 (breaking) (#1956)
- `test-suite` - chore: upgrade bignumber.js to v11 (breaking) (#1955)
- `redis` - chore: upgrade @redis/client to v6 (breaking) (#1954)
- `postgres` - chore: upgrade pg (#1953)
- `mysql` - chore: upgrade mysql2 (#1952)
- `mongo` - chore: upgrade mongodb (#1951)
- `memcache` - chore: upgrade memcache (#1950)
- `dynamo` - chore: upgrade AWS SDK dependencies (#1948)
- `test-suite` - feat: allow storage TTL tests to specify milliseconds or seconds (#1949)
- `website` - chore: upgrade docula to v2 (breaking) (#1947)
- `mono` - chore: upgrade GitHub Actions (breaking) (#1946)
- `mono` - chore: upgrade TypeScript and build tooling (#1945)
- `mono` - chore: upgrade code quality dependencies (breaking) (#1944)
- `mono` - docs: fix broken keyv logo link in package READMEs (#1943)
- `feat`: release management with OIDC and multi versions (#1942)
- `keyv` - fix: `main` branch used instead of `master` for links (#1939)
- `etcd` - feat: replace etcd3 dependency with built-in HTTP/JSON client (#1936)
- `dynamo` - fix: renaming internal isExpired (#1935)
- `dynamo` - fix: storing ttl in ms now also (#1934)
- `mono` - chore: upgrading to TypeScript 6 (#1933)

### `v6.0.0-beta.1`
- `keyv` - feat (breaking) stats / telemetry overhaul (#1912)
- `keyv` - feat: (breaking) memory adapter, bridge adapter, keyv overhaul (#1913)
- `bigmap` - feat: optimize BigMap hash function and hot path performance (#1915)
- `dynamo` - feat: add disconnect and iterator methods to KeyvDynamo (#1914)
- `keyv` - fix: handling has and hasMany better (#1916)
- `keyv` - fix: adding in decode expiring to has (#1917)
- `keyv` - feat: adding hooks for setMany and deleteMany (#1918)
- `keyv` - fix: dead code on getManyRaw (#1919)
- `keyv` - fix: on set with no result do not send telemetry STAT_SET (#1920)
- `keyv` - fix: telemetry issue on setRaw (#1921)
- `keyv` - fix: having encode / decode propagate errors (#1922)
- `keyv` - feat: (breaking) by default keyv no longer checks expires (#1923)
- `keyv` - feat: adding in hooks for clear and disconnect (#1924)
- `keyv` - fix: minor bug fixes on memory, ttl, etc (#1925)
- `mono` - feat: moving to tsdown for build (#1926)
- `encryption-node` - feat: add Node.js encryption adapter for Keyv (#1927)
- `encrypt-web` - feat: adding new web crypto module (#1928)
- `keyv` - feat: (breaking) removing StoredData and StoredDataRaw types (#1929)
- `keyv` - feat: enhancing capabilities (#1930)
- `test-suite` - feat (breaking) overhaul based on v6 changes (#1931)

### `v6.0.0-alpha.4`
- `keyv` - feat: (breaking) moving to Hookified (#1900)
- `compression` - feat: moving to KeyvCompressionAdapter standard (#1901)
- `keyv` - feat: (breaking) api changes and iterator simplification (#1902)
- `keyv` - feat: moving storage setMany to use KeyvEntry (#1903)
- `keyv` - feat: (breaking) moving to boolean return on set (#1904)
- `keyv` - fix: (breaking) setRaw and setMany raw do not need ttl param (#1905)
- `keyv` - feat: (breaking) removing opts from KeyvStorageAdapter (#1906)
- `keyv` - feat: browser compatibility (#1907)
- `keyv` - fix: updating checks for browser tests (#1908)
- `feat`: updating capability helper functions (#1909)
- `keyv` - feat: clean up of code with fixes and helpers (#1910)

**Full Changelog**: https://github.com/jaredwray/keyv/compare/v6.0.0-alpha.3...v6.0.0-beta.3
