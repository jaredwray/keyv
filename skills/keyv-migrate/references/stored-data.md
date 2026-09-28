# Keep stored data readable

## Why data goes missing

Keyv v4 and v5 prefixed every key with the Keyv namespace, which was `keyv` unless the code set one. `keyv.set('foo', 'bar')` handed the adapter `keyv:foo`, and some adapters added a prefix of their own on top.

Keyv v6 has no default namespace and never prefixes keys. Each adapter builds its storage key from its own `namespace` option. After an upgrade, `keyv.get('foo')` looks for a different key and returns `undefined`. Nothing fails; the old entries are still in the store, but v6 no longer finds them.

## Decide per instance

- **A cache that can be rebuilt.** You may let it repopulate. The old entries stay until they expire or someone removes them. Still set a namespace on a shared backend; see [clear() without a namespace](#clear-without-a-namespace).
- **Data that must survive.** Find the matching row below and use its v6 settings. When you can't tell which layout the store holds, ask the user to show you one real key (see [Inspect a real key](#inspect-a-real-key)).

In the tables, `ns` is the namespace the old instance used: the Keyv `namespace` option, or `keyv` if the code never set one. In v5, a namespace set on the adapter was replaced by Keyv's, so Keyv's value is the one that counts. Pass the v6 namespace in Keyv's options, as in `new Keyv(store, { namespace: 'ns' })`, where it takes precedence over the adapter's.

## Settings that read old keys

### Redis (`@keyv/redis`)

v6 builds `<namespace><keyPrefixSeparator><key>`, and the separator defaults to `::`.

| Old setup | Key stored for `foo` | v6 settings |
| --- | --- | --- |
| v4 (`@keyv/redis` 2.x), default | `ns:foo` | `new Keyv(new KeyvRedis(uri, { keyPrefixSeparator: ':' }), { namespace: 'ns' })` |
| v4, `useRedisSets: false` | `sets:namespace:ns:ns:foo` | `new Keyv(new KeyvRedis(uri, { keyPrefixSeparator: ':' }), { namespace: 'sets:namespace:ns:ns' })` |
| v5, default | `ns::ns:foo` | `new Keyv(new KeyvRedis(uri, { keyPrefixSeparator: '::ns:' }), { namespace: 'ns' })` |
| v5, Keyv `useKeyPrefix: false`, or `createKeyv()` with a namespace | `ns::foo` | `new Keyv(new KeyvRedis(uri), { namespace: 'ns' })` |
| v5, `createKeyv()` without a namespace | `foo` | no namespace |

v4 also kept a Redis set named `namespace:ns` listing its keys. v6 doesn't use it; the user can delete it once nothing runs v4.

### Valkey (`@keyv/valkey`, v5 only)

| Old setup | Key stored for `foo` | v6 settings |
| --- | --- | --- |
| default, or `createKeyv()` | `ns:foo` | None. v6 can't build this key. Let the entries repopulate, or have the user rename them to the v6 layout (`namespace:<ns>:<key>`) |
| `useRedisSets: false` | `namespace:ns:ns:foo` | `new Keyv(new KeyvValkey(uri, { useSets: false }), { namespace: 'ns:ns' })` |

### Memcache (`@keyv/memcache`)

v6 builds `<namespace>:<key>`.

| Old setup | Key stored for `foo` | v6 settings |
| --- | --- | --- |
| v4 or v5, default | `ns:ns:foo` | `{ namespace: 'ns:ns' }` |
| v5, `useKeyPrefix: false` | `ns:foo` | `{ namespace: 'ns' }` |

### Etcd and DynamoDB

v6 builds `<namespace>:<key>`.

| Old setup | Key stored for `foo` | v6 settings |
| --- | --- | --- |
| Etcd v4 or v5, default | `ns:foo` | `{ namespace: 'ns' }` |
| DynamoDB v5, default | `ns:foo` | `{ namespace: 'ns' }` |
| DynamoDB v5, `createKeyv()`, with or without a namespace | `foo` | no namespace |
| v5, `useKeyPrefix: false` | `foo` | no namespace |

### SQLite (`@keyv/sqlite`)

v4 and v5 used a `keyv` table with `key` and `value` columns, and the key held `ns:foo`. v6 adds `namespace` and `expires` columns.

- **The table converts on the first connect.** The first v6 process that opens the database rebuilds the table in a transaction, splitting each key at its first `:` into namespace and key. That includes a test run or a one-off script. The conversion is one-way, so the user must copy the database file first.
- **Then read it with `{ namespace: 'ns' }`.** Keys that had no `:` land in the empty namespace: read them with no namespace.
- **Keep `checkExpired` on.** The conversion leaves the new `expires` column empty. Converted entries still expire, because Keyv reads the expiry stored in each value (`checkExpired` defaults to `true`). With `checkExpired: false` they never expire, and `clearExpired()` skips them until they are rewritten.
- **Namespaces that contain `:` split at the wrong place.** A v5 namespace `a:b` becomes namespace `a` with keys like `b:foo`. Point this out to the user; fixing it needs a manual SQL update.

### PostgreSQL and MySQL

v4 and v5 used a `keyv` table keyed by `ns:foo` (the column is `key` in PostgreSQL and `id` in MySQL). v6 needs a namespace column, and the adapter doesn't convert the table on its own. The user runs the migration script that ships with the adapter, first with `--dry-run`:

```sh
npx tsx node_modules/@keyv/postgres/scripts/migrate-v6.ts --uri postgresql://user:pass@host:5432/db [--table keyv] [--schema public] --dry-run
npx tsx node_modules/@keyv/mysql/scripts/migrate-v6.ts --uri mysql://user:pass@host:3306/db [--table keyv] --dry-run
```

Then read the data with `{ namespace: 'ns' }`. With v5's `useKeyPrefix: false`, keys were stored without a prefix: read them with no namespace after the migration.

- The PostgreSQL script resizes the key column to `--keyLength`, 255 by default. If the v5 code set a larger `keySize`, pass the same value with `--keyLength`, and use the `keyLength` option in v6.
- Both scripts split each key at its first `:`. A namespace that contains `:`, or a key with a `:` that was stored without a prefix, ends up split at the wrong place. Point this out when you see such names.

### MongoDB (`@keyv/mongo`)

v4 and v5 stored documents like `{ key: 'ns:foo', value, expiresAt }` with no `namespace` field, and v6 only reads documents that have one. The user runs the migration script, first with `--dry-run`. It isn't transactional, and it is safe to run again:

```sh
npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@host:27017/db [--db name] [--collection keyv] [--gridfs] --dry-run
```

Then read the data with `{ namespace: 'ns' }`. Like the SQL scripts, it splits each key at its first `:`, so namespaces that contain `:` aren't supported.

### `Map` and other in-process stores

Nothing survives a restart, so there is no data to keep. Code that reads the `Map` directly must change, because v6 stores `{ value, expires }` objects in it; see [v5-to-v6.md](v5-to-v6.md#store-wrappers).

## Compressed data

v6 can't decode values that v4 or v5 wrote with a compression adapter, because v6 compresses the whole entry and the old versions didn't. A read emits `error` (for example `incorrect header check` from gzip) and returns `undefined` when an `error` listener is attached, or rejects when none is. The options are:

- Treat the store as a cache and let it repopulate. Consider a new namespace so old and new entries don't collide.
- Have the user run a one-off script that reads each entry with their current Keyv version and writes it again with v6.

## clear() without a namespace

With no namespace, some adapters' `clear()` removes much more than Keyv's entries:

| Adapter | `clear()` with no namespace |
| --- | --- |
| Redis | Deletes every string key without the separator (`::` by default) in its name. With `noNamespaceAffectsAll: true`, runs `FLUSHDB` |
| Valkey | Deletes every key in the database |
| Etcd | Deletes every key |
| DynamoDB | Deletes every item in the table |
| Cloudflare KV | Deletes every key in the KV namespace |
| Memcache | Flushes the whole server, with or without a namespace, as in v5 |
| SQLite, PostgreSQL, MySQL, MongoDB | Deletes only the rows or documents with no namespace |

If the app calls `clear()` and the backend holds anything else, give every Keyv instance a namespace.

## Rollout

- **Back up first.** Every conversion (SQLite, PostgreSQL, MySQL, MongoDB) rewrites data in place and can't be undone.
- **Stop v5 writers.** v5 and v6 can't share a store. Don't run v5 and v6 against the same data at the same time, and avoid a rolling deploy that mixes them.
- **Convert, then deploy.** Run the migration script, then deploy v6 with the matching namespace, then check a known key.

## Inspect a real key

Only with the user's approval, and only read-only commands. Adjust the table or collection name.

```sh
redis-cli --scan --count 100 | head -20                       # Redis and Valkey
sqlite3 cache.sqlite "PRAGMA table_info(keyv); SELECT key FROM keyv LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT key FROM keyv LIMIT 5;"
mysql -e "SELECT id FROM keyv LIMIT 5;" dbname
mongosh "$MONGO_URL" --eval 'db.keyv.findOne({}, { key: 1, namespace: 1 })'
etcdctl get "" --prefix --keys-only --limit 5
aws dynamodb scan --table-name keyv --max-items 5 --projection-expression id
```

Memcache can't list keys. Work from the code's configuration instead.
