# Find Keyv v4 and v5 usages

Run these searches from the project root. They use ripgrep (`rg`), which skips `node_modules` and files in `.gitignore`. With `grep`, use `grep -rnE --exclude-dir=node_modules --exclude-dir=dist` and the same pattern. Also skip lockfiles and build output.

A pattern can match unrelated code, so check every hit. Keep the list: you run the same searches again in step 5 of SKILL.md. Searches can miss code that reaches Keyv through a variable or a wrapper, so also read the code around each Keyv instance.

After the upgrade, the TypeScript compiler finds many removed APIs, but not the changes in [Silent changes](#silent-changes). Search for those even when the project compiles.

## Where Keyv is used

```sh
rg -n "(from\s+|require\(\s*|import\(\s*)['\"](keyv|@keyv/[a-z0-9-]+)['\"]"   # imports and requires
rg -n "\"(keyv|@keyv/[a-z0-9-]+)\"\s*:" -g "package.json"                      # dependencies
rg -n "npm:(keyv|@keyv/[a-z0-9-]+)@"                                           # npm aliases, such as a copy kept on v5
rg -n "new Keyv\b|createKeyv\("                                                 # every Keyv instance
rg -n "new Keyv[A-Z][A-Za-z]*\("                                               # every adapter instance
```

Record, for each instance, the store, the namespace, and the options. You need them for the stored-data decision. If the project has npm aliases, search for imports of the alias names too.

## Silent changes

These don't fail to compile, and most don't throw. Fix every hit.

**Connection strings and v4 options.** v6 ignores a string first argument, `uri`, and `adapter` and falls back to an in-memory store. Fix: pass an adapter ([v4-to-v5.md](v4-to-v5.md)).

```sh
rg -n "new Keyv\(\s*['\"\`]"                              # new Keyv('redis://...')
rg -n "new Keyv\(\s*(process\.env|[A-Za-z_$][\w$.]*(url|uri|Url|Uri|URL|URI))"   # string from a variable
rg -n -U "new Keyv\(\s*\{[^}]*\b(uri|adapter)\s*:"          # new Keyv({ uri, adapter })
```

**CommonJS requires.** `require('keyv')` returns `{ Keyv, default, ... }`, so `new` on it throws at run time. `@keyv/redis` has only a default export. This matches only a plain `const X = require(...)`, so destructured and `.default` requires, which are already right, don't show up. Fix: [v4-to-v5.md](v4-to-v5.md#commonjs).

```sh
rg -n "(const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\(['\"](keyv|@keyv/[a-z0-9-]+)['\"]\)\s*;?\s*$"
```

**No namespace.** Every instance without a `namespace` option now reads different keys than v4 or v5 wrote, and `clear()` on it can remove much more. Review every `new Keyv` and `createKeyv` hit from the first search. Fix: [stored-data.md](stored-data.md).

**Hard-coded key prefixes.** v4 and v5 handed hooks, iterators, and adapters keys like `keyv:foo`. Code that adds, strips, or parses that prefix is now wrong.

```sh
rg -n "['\"\`][\w-]*::?['\"\`]"                             # string literals such as 'keyv:' or '::'
```

**Removed Keyv options.** In JavaScript they are ignored. `throwOnErrors` passed to `new KeyvRedis(...)` is still valid; only remove it from Keyv options.

```sh
rg -n "\b(serialize|deserialize|useKeyPrefix|emitErrors|throwOnErrors)\s*:"
rg -n "\.(serialize|deserialize|useKeyPrefix)\s*="
```

**Raw reads.** `get(key, { raw: true })` now returns the plain value, so `.expires` is `undefined`. v4 raw values had `expires: null` where v6 leaves it out. Fix: `getRaw` or `getManyRaw`, and compare `expires` with `undefined`.

```sh
rg -n "raw\s*:\s*true"
rg -n "\.expires\b"
```

**Array results used as booleans.** `deleteMany` and `delete([...])` return `boolean[]`, which is always truthy, and `setMany` returns `boolean[]` too. `delete(key)` with one key still returns a boolean. Check every call: the argument can be an array even when its name doesn't say so.

```sh
rg -n "\.(deleteMany|setMany)\("
rg -n "\.delete\("
```

**Missing values.** Missing keys are always `undefined`, never `null`.

```sh
rg -n "(===|!==)\s*null"          # check the hits that test a value read from Keyv
```

**Error handling.** A failed call rejects when no `error` listener is attached. With a listener, it returns a fallback value, even where v4 rejected. Adapters that lose their connection emit errors that crash the process when nothing listens. Find the listeners and the try/catch blocks around Keyv calls. Fix: [v5-to-v6.md](v5-to-v6.md#errors) and [v4-to-v5.md](v4-to-v5.md#errors).

```sh
rg -n "\.on\(\s*['\"]error['\"]"
```

**Hooks.** Hook payloads now carry the key without the namespace prefix, hooks are awaited, and a hook that throws emits `error`.

```sh
rg -n "hooks\.(addHandler|removeHandler|handlers|trigger)\b"
rg -n "KeyvHooks\.(PRE|POST)_|['\"](pre|post)(Set|Get|GetMany|GetRaw|GetManyRaw|SetRaw|SetMany|SetManyRaw|Delete|DeleteMany)['\"]"
```

**The store object.** `keyv.store` returns the wrapper Keyv created for a `Map` or an older adapter. A `Map` store now holds `{ value, expires }` objects.

```sh
rg -n "\.store\.(get|set|has|delete|keys|values|entries|size|clear)\b"
rg -n "\.store\s*(===|!==|instanceof)"
```

**Direct adapter calls.** An adapter's own `set` and `setMany` now take an absolute `expires` timestamp, not a relative `ttl`. For each adapter instance from the first searches that the code keeps in a variable or exports, find its `.set(` and `.setMany(` calls. Fix: [adapters.md](adapters.md#calling-an-adapter-directly).

**TTL values.** A TTL of zero or less now means no TTL. Look for negative TTLs used to expire an entry at once.

```sh
rg -n "\.set\([^)]*,\s*-\s*\d"
rg -n "\bttl\s*:\s*-"
```

**Compression.** Entries written with compression by v4 or v5 can't be read by v6. Fix: [stored-data.md](stored-data.md#compressed-data).

```sh
rg -n "@keyv/compress-|compression\s*:"
```

**Stats.** Stats now count per key, and the v5 `StatsManager` methods are gone.

```sh
rg -n "\.stats\.(hit|miss|set|delete|hitsOrMisses|reset)\("
```

## Fails to compile in TypeScript

These are also runtime errors in JavaScript. Fix: [v5-to-v6.md](v5-to-v6.md).

```sh
rg -n "\.opts\b"                                   # keyv.opts and adapter.opts
rg -n "\b(StoredData|StoredDataRaw|StoredDataNoRaw|CompressionAdapter|Serialize|Deserialize|IEventEmitter)\b"
rg -n "\b(KeyvStoreAdapter|DeserializedData|KeyvCompression)\b"     # deprecated aliases: rename
rg -n "\.iterator\(\s*[^)\s]"                      # iterator(namespace)
rg -n "Keyv<[^>]*,[^>]*>"                          # v4 Keyv<Value, Options>
rg -n "Keyv\.(Options|Store|DeserializedData|CompressionAdapter)\b"   # v4 namespace types
```

## Packages and adapters

Fix: [dependencies.md](dependencies.md) and [adapters.md](adapters.md).

```sh
rg -n "@keyv/(serialize|offline|tiered)['\"]"              # removed packages
rg -n "\b(ioredis|memjs|etcd3|sqlite3)\b"                  # drivers the adapters no longer use
rg -n "\b(useRedisSets|keySize|lease|sixHoursInMilliseconds|ttlSupport|dialect)\b"
rg -n "KeyvValkey|@keyv/valkey"                            # valkey: `redis` property is now `client`
rg -n "KeyvMemcache\(\s*['\"][^'\"]*@"                     # memcache credentials in the host string
rg -n "\.clear\(\)"                                        # check each instance has a namespace
```

## Custom adapters and adapter tests

Fix: [custom-adapters.md](custom-adapters.md).

```sh
rg -n "implements\s+(KeyvStoreAdapter|KeyvStorageAdapter)\b"
rg -n "^\s*(public\s+|private\s+|protected\s+|readonly\s+)*(opts|ttlSupport|dialect)\s*[:=]"   # removed adapter fields
rg -n "(async\s+)?set\s*\([^)]*\bttl\b"                    # set(key, value, ttl)
rg -n "setMany\([^)]*\bttl\b"                             # setMany entries with ttl
rg -n "deleteMany\([^)]*\)\s*:\s*Promise<boolean>"        # deleteMany returning one boolean
rg -n "@keyv/test-suite"
rg -n "import\s+[A-Za-z_$][\w$]*\s*(,\s*\{[^}]*\})?\s*from\s*['\"]@keyv/test-suite['\"]"   # v5 default import
rg -n "keyvCompresstionTests|keyvCompressionTests|keyvNamespaceTest\b"
rg -n "import \* as test from ['\"]vitest['\"]|import test from ['\"]vitest['\"]"
```

Searches can't tell you what an adapter lacks. Check each custom adapter against this list by reading it:

- It has `get`, `set`, `delete`, `clear`, `has`, `hasMany`, `getMany`, `setMany`, and `deleteMany`.
- `clear()` and `iterator()` touch only the current namespace.
- It declares `capabilities` with `keyvStorageCapability(this)`.
