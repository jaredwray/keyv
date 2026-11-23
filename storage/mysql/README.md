# @keyv/mysql [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> MySQL/MariaDB storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/mysql.svg)](https://www.npmjs.com/package/@keyv/mysql)
[![npm](https://img.shields.io/npm/dm/@keyv/mysql)](https://npmjs.com/package/@keyv/mysql)

MySQL/MariaDB storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Migrating to v6](#migrating-to-v6)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
  - [uri](#uri)
  - [table](#table)
  - [keyLength](#keylength)
  - [namespaceLength](#namespacelength)
  - [iterationLimit](#iterationlimit)
  - [intervalExpiration](#intervalexpiration)
  - [namespace](#namespace-1)
- [Namespace Support](#namespace-support)
- [Methods](#methods)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.clearExpired()](#clearexpired)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
- [Connection Pooling](#connection-pooling)
- [SSL](#ssl)
- [PlanetScale](#planetscale)
  - [Password and connection string](#password-and-connection-string)
  - [TLS](#tls)
  - [Branches, safe migrations, and the table](#branches-safe-migrations-and-the-table)
  - [Connection pooling and limits](#connection-pooling-and-limits)
  - [Vitess and PlanetScale limits](#vitess-and-planetscale-limits)
  - [Example](#example)
  - [Troubleshooting](#troubleshooting)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/mysql
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql('mysql://user:pass@localhost:3306/dbname'));
keyv.on('error', handleConnectionError);
```

You can also use the `createKeyv` helper function to create a `Keyv` instance with `KeyvMysql` as the store:

```js
import { createKeyv } from '@keyv/mysql';

const keyv = createKeyv('mysql://user:pass@localhost:3306/dbname');
```

Or with an options object:

```js
import { createKeyv } from '@keyv/mysql';

const keyv = createKeyv({ uri: 'mysql://user:pass@localhost:3306/dbname', table: 'cache', keyLength: 512 });
```

You can specify a custom table with the `table` option and the primary key length with `keyLength`.
To delete expired keys periodically in the background, specify `intervalExpiration` in seconds.

e.g:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyv = new Keyv(new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  table: 'cache',
  keyLength: 255,
  intervalExpiration: 60
}));
```

## Migrating to v6

### Breaking changes

#### Native namespace support

In v5, namespaces were stored as key prefixes in the `id` column (e.g. `id="myns:mykey"` with `namespace=''`). In v6, the namespace is stored in a dedicated `namespace` column (e.g. `id="mykey"`, `namespace="myns"`). This enables more efficient queries and proper namespace isolation.

The adapter automatically adds the `namespace` column and makes `(namespace, id)` the table's primary key when it connects, so no manual schema changes are needed for new installations. It replaces v5's primary key on `id`, a primary key on only a prefix of `namespace` or `id` (which treats keys that share the prefix as one key), and the primary key MySQL generates for a table created without one, dropping its `my_row_id` column. Each is replaced in a single statement, so the table always has a primary key, as servers with `sql_require_primary_key` or generated invisible primary keys require. A primary key you added on any other column, including a `my_row_id` column of your own, is kept with its column, and `(namespace, id)` gets a unique index instead.

#### `keySize` renamed to `keyLength`

The `keySize` option and property has been renamed to `keyLength` for consistency with the migration script and to better reflect that it controls key length.

```js
// v5
const store = new KeyvMysql({ uri, keySize: 512 });
store.keySize; // 512

// v6
const store = new KeyvMysql({ uri, keyLength: 512 });
store.keyLength; // 512
```

### New features

#### Native TTL support with `expires` column

v6 adds an `expires BIGINT` column to the table. When you store a value with a TTL through Keyv core, Keyv passes an absolute `expires` timestamp (Unix ms) to the adapter's `set`, and the adapter stores it in the column. The adapter does not parse the serialized value. The `intervalExpiration` application timer queries this column directly instead of extracting from JSON, which is significantly more efficient.

The schema migration is automatic on connect — existing tables get the column and index added automatically.

#### `clearExpired()` method

A new utility method that deletes all rows where the `expires` column is set and the timestamp is in the past:

```js
await keyvMysql.clearExpired();
```

#### Bulk operations

v6 adds new methods for efficient multi-key operations:

- `.setMany(entries)` — bulk upsert using `ON DUPLICATE KEY UPDATE`
- `.hasMany(keys)` — bulk existence check

### Running the migration script

If you have existing data from v5, you need to run the migration script to move namespace prefixes from keys into the new `namespace` column. The script ships in the npm package at `scripts/migrate-v6.ts`. Run it from your project root with `tsx`. Node.js refuses to strip TypeScript types from files under `node_modules`, so running the script with plain `node` from there fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

Preview the changes first with `--dry-run`:

```shell
npx tsx node_modules/@keyv/mysql/scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --dry-run
```

Dry-run mode only reads schema metadata and previews affected rows; it does not modify the schema or data.

Run the migration:

```shell
npx tsx node_modules/@keyv/mysql/scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname
```

You can also specify a custom table and column lengths:

```shell
npx tsx node_modules/@keyv/mysql/scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --table cache
npx tsx node_modules/@keyv/mysql/scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/dbname --keyLength 512 --namespaceLength 256
```

From a clone of this repo you can run `node scripts/migrate-v6.ts` in `storage/mysql` with the same flags.

The migration runs inside a transaction and will roll back automatically if anything fails.

The migration script also populates the new `expires` column from existing JSON values in the `value` column.

**Important notes:**
- The script only migrates namespace rows where `namespace = ''` (the default). Rows that already have a namespace value (e.g. from a partial earlier migration) are skipped.
- Keys are split on the first colon — the part before becomes the namespace, the rest becomes the key. Namespaces containing colons are not supported.
- Keyv v5 used `keyv` as the namespace when none was set, so rows written that way migrate into namespace `keyv`. Pass `namespace: 'keyv'` to Keyv afterwards to keep reading them. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#the-default-keyv-namespace-was-removed).
- The `expires` column is populated by extracting `value->'$.expires'` from existing JSON values.

## Constructor Options

`KeyvMysql` accepts a connection URI string or an options object. The options object accepts the following properties along with any [`PoolOptions`](https://sidorares.github.io/node-mysql2/docs) from the `mysql2` library (e.g. `host`, `port`, `user`, `password`, `database`, `connectionLimit`):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `'mysql://localhost'` | MySQL connection URI |
| `table` | `string` | `'keyv'` | Table name for key-value storage |
| `keyLength` | `number` | `255` | Maximum key length in Unicode code points |
| `namespaceLength` | `number` | `255` | Maximum namespace length in Unicode code points |
| `iterationLimit` | `number` | `10` | Number of rows fetched per batch during iteration |
| `intervalExpiration` | `number` | `undefined` | Interval in seconds for application-level expiration cleanup |

Because MySQL limits an InnoDB composite index to 3072 bytes and each Unicode code point may require four UTF-8 bytes, `keyLength + namespaceLength` must not exceed 768. The constructor, `resizeKeyColumns()`, and migration script reject larger combinations before changing the schema.

## Properties

Connection and schema configuration is exposed through getter-only properties. `uri`, `table`, `keyLength`, and `namespaceLength` cannot be assigned directly because changing them requires asynchronous connection or schema work. Use the awaited `reconnect()`, `useTable()`, and `resizeKeyColumns()` methods instead.

`iterationLimit`, `intervalExpiration`, and `namespace` remain mutable because their setters update live adapter behavior.

### uri

Get the active MySQL connection URI. This property is getter-only; use `reconnect()` to change it.

- Type: `string`
- Default: `'mysql://localhost'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.uri); // 'mysql://user:pass@localhost:3306/dbname'
```

### table

Get the active table name. This property is getter-only; use `useTable()` to change it.

- Type: `string`
- Default: `'keyv'`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
console.log(store.table); // 'keyv'
```

### keyLength

Get the active maximum key length in Unicode code points. This property is getter-only because it determines the initialized schema; use `resizeKeyColumns()` to change it.

- Type: `number`
- Default: `255`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', keyLength: 512 });
console.log(store.keyLength); // 512
```

### namespaceLength

Get the active maximum namespace length in Unicode code points. This property is getter-only because it determines the initialized schema; use `resizeKeyColumns()` to change it.

- Type: `number`
- Default: `255`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', namespaceLength: 512 });
console.log(store.namespaceLength); // 512
```

### iterationLimit

Get or set the number of rows to fetch per iteration batch.

- Type: `number`
- Default: `10`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', iterationLimit: 50 });
console.log(store.iterationLimit); // 50
```

### intervalExpiration

Get or set the interval in seconds for automatic expiration cleanup. When set to a value greater than 0, the adapter starts an unref'd application timer that periodically deletes expired entries. Changing the value restarts the timer, while `0` or `undefined` disables it. Cleanup runs never overlap, and changing the interval after `disconnect()` does not restart the timer. Values above `2147483.647` seconds are rejected because they exceed Node.js's maximum timer delay. The timer is stopped by `disconnect()` and does not require MySQL `EVENT` or global-variable privileges.

- Type: `number | undefined`
- Default: `undefined` (disabled)

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname', intervalExpiration: 60 });
console.log(store.intervalExpiration); // 60
```

Earlier v6 prereleases created a schema event named `keyv_delete_expired_keys`. The adapter no longer creates, changes, or drops server events. If that legacy event exists, a database administrator can remove it once with `DROP EVENT IF EXISTS keyv_delete_expired_keys`.

### namespace

Get or set the namespace for the adapter. Used for key prefixing and scoping operations like `clear()`.

- Type: `string | undefined`
- Default: `undefined`

```js
const store = new KeyvMysql({ uri: 'mysql://user:pass@localhost:3306/dbname' });
store.namespace = 'my-namespace';
console.log(store.namespace); // 'my-namespace'
```

## Namespace Support

The MySQL adapter supports native namespace scoping. When a namespace is set, keys are stored in a dedicated `namespace` column rather than being embedded in the key name. This provides efficient filtering and proper isolation between namespaces.

Keys and namespaces are stored as exact UTF-8 bytes. Comparisons therefore preserve case, accents, Unicode normalization, and trailing spaces regardless of the database's default collation. For example, `AuditKey` and `auditkey`, composed and decomposed forms of `é`, and `key` and `key ` are all distinct. Existing text key columns are converted independently when the adapter initializes, preserving each column's existing character width.

The unique composite index is ordered as `(namespace, id)`, allowing MySQL to use the same index for exact key lookups, namespace clears, and namespace-scoped iteration. Existing `(id, namespace)` indexes created by earlier v6 prereleases are replaced atomically.

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const keyvA = new Keyv({ store: new KeyvMysql(uri), namespace: 'cache-a' });
const keyvB = new Keyv({ store: new KeyvMysql(uri), namespace: 'cache-b' });

// These don't conflict despite having the same key name
await keyvA.set('user:1', 'Alice');
await keyvB.set('user:1', 'Bob');

// clear() only affects the namespace it belongs to
await keyvA.clear(); // Only clears 'cache-a' entries
```

## Methods

Runtime configuration methods are serialized with one another. Always await them before starting operations that must use the new configuration. `useTable()` and `resizeKeyColumns()` perform schema work and should be run while application writes are paused for a deterministic cutover.

### .reconnect(uri, mysqlOptions?)

Creates a replacement mysql2 pool, initializes the currently configured table on it, and switches the adapter only after preparation succeeds. The previous pool remains active during preparation and is closed after its already-started queries settle. If preparation fails, the adapter keeps using the previous connection.

Calling `reconnect()` after `disconnect()` reactivates the adapter and restarts automatic expiration cleanup when `intervalExpiration` is configured.

- `uri` *(string)* - MySQL connection URI for the replacement pool.
- `mysqlOptions` *(PoolOptions, optional)* - Replacement mysql2 pool options applied on top of the URI settings. When omitted, the replacement uses only the URI.
- Returns: `Promise<void>`

```js
await keyvMysql.reconnect('mysql://user:pass@replica.example.com:3306/cache', {
  connectionLimit: 20
});
console.log(keyvMysql.uri); // the replica URI
```

### .useTable(table)

Creates or migrates the target table using the same initialization performed by the constructor, then makes it active. The previous table remains active if initialization fails. This method does not copy, move, or delete data from the previous table.

- `table` *(string)* - Target table name. Database-qualified names such as `database.cache` are supported.
- Returns: `Promise<void>`

```js
await keyvMysql.useTable('sessions');
console.log(keyvMysql.table); // 'sessions'
```

### .resizeKeyColumns(options)

Changes the logical character limits and resizes both `VARBINARY` columns in one `ALTER TABLE` operation. Omitted values keep their current limits. Before changing the schema, the adapter validates MySQL's composite-index limit and scans existing UTF-8 keys and namespaces. A narrowing change is rejected if stored data exceeds the requested limit, leaving the schema and active limits unchanged.

- `options.keyLength` *(number, optional)* - New maximum key length in Unicode code points.
- `options.namespaceLength` *(number, optional)* - New maximum namespace length in Unicode code points.
- Returns: `Promise<void>`

```js
await keyvMysql.resizeKeyColumns({
  keyLength: 384,
  namespaceLength: 128
});
console.log(keyvMysql.keyLength); // 384
console.log(keyvMysql.namespaceLength); // 128
```

### .get(key)

Returns the value for the given key. Returns `undefined` if the key does not exist.

```js
const value = await keyvMysql.get('foo');
```

### .getMany(keys)

Returns an array of values for the given keys. Returns `undefined` for any key that does not exist.

```js
const values = await keyvMysql.getMany(['foo', 'bar']);
```

### .set(key, value, expires?)

Sets a value for the given key. If the key already exists, it will be updated. Returns `true` on success, `false` on failure.

- `key` *(string)* - The key to set.
- `value` *(any)* - The value to store.
- `expires` *(number, optional)* - Absolute expiry as a Unix timestamp in milliseconds (`Date.now() + ttl`). `undefined` means no expiry.
- Returns: `Promise<boolean>`

When you call `keyv.set(key, value, ttl)` on a Keyv instance, `ttl` is still relative. Keyv converts it to `expires` before it calls the adapter.

```js
await keyvMysql.set('foo', 'bar');
await keyvMysql.set('foo', 'bar', Date.now() + 5000); // expires in 5 seconds
```

### .setMany(entries)

Set multiple key-value pairs at once using a single atomic `INSERT ... ON DUPLICATE KEY UPDATE` statement. Each entry is a `KeyvStorageEntry<Value>` object (`{ key: string, value: Value, expires?: number }`), where `expires` is an absolute Unix timestamp in milliseconds and `Value` is inferred from the entries provided. Returns a `boolean[]` indicating whether each entry was set successfully. Since the SQL statement is atomic, all entries either succeed (`true`) or all fail (`false`) together. On failure, an `error` event is emitted.

```js
const results = await keyvMysql.setMany([
  { key: 'foo', value: 'bar' },
  { key: 'baz', value: 'qux', expires: Date.now() + 5000 },
]); // [true, true]
```

### .delete(key)

Deletes a key-value pair from the store. Returns `true` if the key existed and was deleted, `false` otherwise. An expired entry is deleted too, but returns `false`.

```js
const deleted = await keyvMysql.delete('foo');
```

### .deleteMany(keys)

Deletes multiple key-value pairs from the store. Returns a `boolean[]` indicating whether each key was deleted. Expired entries are deleted too, but return `false`.

```js
const results = await keyvMysql.deleteMany(['foo', 'bar']); // [true, true]
```

### .clear()

Clears all entries from the store. If a namespace is set, only entries within that namespace are cleared.

```js
await keyvMysql.clear();
```

### .has(key)

Returns `true` if the key exists in the store, `false` otherwise.

```js
const exists = await keyvMysql.has('foo');
```

### .hasMany(keys)

Check if multiple keys exist. Returns an array of booleans in the same order as the input keys.

```js
await keyvMysql.set('foo', 'bar');
await keyvMysql.set('baz', 'qux');

const results = await keyvMysql.hasMany(['foo', 'baz', 'unknown']); // [true, true, false]
```

### .clearExpired()

Deletes all entries where the `expires` column is set and the timestamp is in the past. Useful for periodic cleanup of expired entries.

```js
await keyvMysql.clearExpired();
```

### .iterator()

Returns an async iterator for iterating over all key-value pairs in the store. The iterator uses the namespace configured on the instance. Uses keyset pagination to efficiently handle large datasets.

```js
for await (const [key, value] of keyvMysql.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Stops the adapter from accepting new queries, waits for queries that have already started, and closes the adapter's connection pool. Repeated calls are safe and wait for the same shutdown.

```js
await keyvMysql.disconnect();
```

## Connection Pooling

Each `KeyvMysql` adapter creates and owns one `mysql2` connection pool. Pools are not shared implicitly between adapter instances, even when those adapters use the same URI and connection options. This keeps connection configuration and shutdown isolated: disconnecting one adapter does not affect another adapter.

Pool options such as `connectionLimit`, `maxIdle`, `idleTimeout`, and `queueLimit` are passed through to `mysql2` and apply separately to each adapter. If an application creates multiple adapters, account for the combined number of database connections.

Call `disconnect()` when an adapter is no longer needed, especially for short-lived instances:

```js
const store = new KeyvMysql({
  uri: 'mysql://user:pass@localhost:3306/dbname',
  connectionLimit: 10,
});
const keyv = new Keyv({ store });

try {
  await keyv.set('foo', 'bar');
} finally {
  await keyv.disconnect();
}
```

## SSL

SSL options are passed through to `mysql2` as part of the options object. The constructor takes a single argument, so include the `uri` alongside the `ssl` configuration:

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';
import fs from 'fs';
import path from 'path';

const keyvMysql = new KeyvMysql({
	uri: 'mysql://user:pass@localhost:3306/dbname',
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, '/certs/ca.pem')).toString(),
		key: fs.readFileSync(path.join(__dirname, '/certs/client-key.pem')).toString(),
		cert: fs.readFileSync(path.join(__dirname, '/certs/client-cert.pem')).toString(),
	},
});
const keyv = new Keyv({ store: keyvMysql });
```

## PlanetScale

`@keyv/mysql` connects to a [PlanetScale](https://planetscale.com/docs/vitess) Vitess database with the same options that it uses for other MySQL servers. This section is for PlanetScale Vitess (MySQL) databases. For PlanetScale Postgres, use `@keyv/postgres`.

The adapter uses the `mysql2` driver over the MySQL protocol. It does not use the [PlanetScale serverless driver for JavaScript](https://planetscale.com/docs/vitess/tutorials/planetscale-serverless-driver) (`@planetscale/database`), which sends queries over HTTP. PlanetScale says that some serverless and edge hosts do not permit outbound TCP connections. On those hosts, `@keyv/mysql` cannot connect.

### Password and connection string

Create a password for the branch that Keyv uses. Do these steps in the PlanetScale dashboard, as [Connection strings](https://planetscale.com/docs/vitess/connecting/connection-strings) describes:

1. Open the database.
2. Click **Connect**.
3. Select the branch.
4. Select the password role.
5. Type a name for the password.
6. Click **Create password**.
7. Copy the username, password, and host. PlanetScale does not show the password again.

You can also use the [CLI](https://planetscale.com/docs/cli/password): `pscale password create <DATABASE_NAME> <BRANCH_NAME> <PASSWORD_NAME> --role admin`. Select these settings for the password:

- **Branch.** A password is for one branch only. It cannot get access to the data or schema of a different branch.
- **Role.** Use the **Admin** role, because the adapter changes the schema when it connects. See [Branches, safe migrations, and the table](#branches-safe-migrations-and-the-table). The Read-only, Write-only, and Read/write roles cannot change the schema. Passwords from the **Connect** button have the `Administrator` (Admin) role. You cannot change the role of a password after you create it. See [Password roles](https://planetscale.com/docs/vitess/security/password-roles).
- **Connection type.** Use **Primary**. Do not use a **Replica** or **Read-only region** password, because the adapter must write. The CLI gives these passwords the `reader` role by default.

Put the values in a URI:

```js
const user = encodeURIComponent(process.env.PLANETSCALE_USERNAME);
const password = encodeURIComponent(process.env.PLANETSCALE_PASSWORD);
const uri = `mysql://${user}:${password}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}`;
```

The adapter decodes percent-encoded characters in the user name and password. PlanetScale's [Node.js guide](https://planetscale.com/docs/vitess/tutorials/connect-nodejs-app) adds `?ssl={"rejectUnauthorized":true}` to the URI. `@keyv/mysql` reads only the user, password, host, port, and database from `uri`. It ignores the query string. Set TLS with the `ssl` option.

### TLS

PlanetScale requires SSL. See [Connect a MySQL GUI](https://planetscale.com/docs/vitess/tutorials/connect-mysql-gui). [Connecting to PlanetScale securely](https://planetscale.com/docs/vitess/connecting/secure-connections) tells you to verify the server certificate. PlanetScale signs its certificates with a CA that is in the root store of common systems.

The adapter gives the `ssl` option to `mysql2` without changes. Use this setting:

```js
const store = new KeyvMysql({
	uri,
	ssl: { rejectUnauthorized: true, verifyIdentity: true },
});
```

- `rejectUnauthorized: true` makes Node.js verify the certificate against its built-in CA store. PlanetScale's Node.js guide uses this setting. `mysql2` sets it to `true` for every `ssl` object, unless you set it to `false`.
- `verifyIdentity: true` makes `mysql2` verify that the certificate is for the host in `uri`. `mysql2` does not do this check by default. Together with `rejectUnauthorized: true`, it agrees with the `VERIFY_IDENTITY` mode that PlanetScale tells you to use with the `mysql` client.
- Use the host name from the **Connect** page in `uri`. If the host is an IP address, `mysql2` does not give it to Node.js. Node.js then checks the certificate for `localhost`, and the check fails.

If your runtime must use the system CA file, give it as `ssl.ca`. PlanetScale lists the path for each operating system in [CA root configuration](https://planetscale.com/docs/vitess/connecting/secure-connections#ca-root-configuration). For example, use `/etc/ssl/certs/ca-certificates.crt` on Debian and Ubuntu:

```js
import fs from 'node:fs';

const store = new KeyvMysql({
	uri,
	ssl: {
		ca: fs.readFileSync('/etc/ssl/certs/ca-certificates.crt', 'utf8'),
		verifyIdentity: true,
	},
});
```

PlanetScale tells you to set this path only if your driver needs it. Do not download only the CA that PlanetScale uses now, because PlanetScale can change its CA. Do not set `rejectUnauthorized: false`. Without certificate verification, the connection is open to man-in-the-middle attacks. The [SSL](#ssl) example uses that setting, and it is only for local test servers.

### Branches, safe migrations, and the table

The adapter creates and updates its table itself. The constructor and each `reconnect()` call send `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN expires`, and `CREATE INDEX` for the `expires` index. `useTable()` sends the same statements when the table name changes. The adapter ignores only the "duplicate column" and "duplicate key name" errors. It sends these DDL statements when the table exists and is current, too. `resizeKeyColumns()` also sends `ALTER TABLE`.

The adapter has no option to skip this work. An operation does not start until this work is complete.

PlanetScale does these things with DDL:

- A new database has one production branch, `main`. Safe migrations are off on production branches by default. See [Connect any application](https://planetscale.com/docs/vitess/tutorials/connect-any-application).
- You can turn on [safe migrations](https://planetscale.com/docs/vitess/schema-changes/safe-migrations) on production and development branches. On a branch with safe migrations on, PlanetScale rejects all DDL that you send to the branch. This is true for each password role, Admin too.
- To change the schema of a branch with safe migrations on, use a [deploy request](https://planetscale.com/docs/vitess/schema-changes/deploy-requests). See [Branching](https://planetscale.com/docs/vitess/schema-changes/branching).

Thus, the adapter starts only on a branch that accepts DDL:

| Branch | Password role | Result |
| --- | --- | --- |
| Development branch, safe migrations off | Admin | The adapter creates the table when it connects first. |
| Production branch, safe migrations off | Admin | The adapter creates the table when it connects first. |
| Any branch, safe migrations on | Any role | Each operation fails, because PlanetScale rejects the DDL. |
| Any branch | Read-only, Write-only, or Read/write | Each operation fails, because the role cannot send DDL. |

You can create the table on a development branch and merge it to production with a deploy request. But the adapter still sends DDL each time that it starts. Thus, it cannot use a branch with safe migrations on. A table that you create before you connect does not help, for the same reason.

Select one of these configurations:

- **A different database for Keyv.** Turn off safe migrations on the production branch of that database. Keep safe migrations on for your application database.
- **Safe migrations off on your production branch.** PlanetScale recommends safe migrations for all production branches, so this removes the protection from all of your tables.

If you turn on safe migrations later, the adapter fails the next time that it starts or calls `reconnect()`.

### Connection pooling and limits

Each `KeyvMysql` adapter has one `mysql2` pool, and `connectionLimit` sets its size. The default is `10`. See [Connection Pooling](#connection-pooling).

- PlanetScale does not meter concurrent connections. See [Plans](https://planetscale.com/docs/planetscale-plans).
- PlanetScale limits the number of simultaneous transactions in each keyspace. This limit is the transaction pool. The limit depends on the cluster size. For example, it is `70` on `PS-10`. See the table in [Transaction pools](https://planetscale.com/docs/plans/planetscale-skus#transaction-pools-vitess).
- Above the limit, queries fail with `transaction pool connection limit exceeded`. See [Vitess system limits](https://planetscale.com/docs/vitess/troubleshooting/planetscale-system-limits).

The adapter runs one statement at a time on each pool connection. It does not start transactions. Thus, Keyv can run a maximum of processes × adapters × `connectionLimit` statements at the same time. Keep this number below the transaction pool of your cluster. Keep space in the pool for the other queries of your application.

PlanetScale can close a connection that stays open for more than 24 hours. It recommends that you close and open long-lived connections again at least one time each day. `mysql2` has no maximum connection age. It closes idle connections after `idleTimeout` only when `maxIdle` is less than `connectionLimit`. A busy connection can stay open for more than a day.

To replace all connections, call `reconnect()` on a timer. `reconnect()` replaces the `mysql2` options. Give it the same options again:

```js
const options = { ssl: { rejectUnauthorized: true, verifyIdentity: true }, connectionLimit: 5 };
const store = new KeyvMysql({ uri, ...options });

setInterval(() => {
	store.reconnect(uri, options).catch((error) => console.error('reconnect failed', error));
}, 12 * 60 * 60 * 1000).unref();
```

### Vitess and PlanetScale limits

The adapter's SQL agrees with the [MySQL compatibility](https://planetscale.com/docs/vitess/troubleshooting/mysql-compatibility) rules of PlanetScale:

- **Primary key.** PlanetScale requires a unique, not-null key on each table. The table has `PRIMARY KEY (namespace, id)` on two complete `VARBINARY` columns. PlanetScale rejects primary keys with [`BLOB` or `TEXT` columns](https://planetscale.com/docs/vitess/schema-changes/schema-lint-errors/blob-in-unique-key) or [prefix lengths](https://planetscale.com/docs/vitess/schema-changes/schema-lint-errors/partial-key-in-unique-key), and this key has neither.
- **Foreign keys, triggers, and events.** The adapter creates no foreign keys, so it works when [foreign key support](https://planetscale.com/docs/vitess/foreign-key-constraints) is off. PlanetScale does not support stored routines, triggers, or events. The adapter uses none. `intervalExpiration` uses an application timer, not a MySQL `EVENT`.

PlanetScale has [query limits](https://planetscale.com/docs/vitess/troubleshooting/planetscale-system-limits#query-limits) that apply to some adapter operations:

- **100,000 rows in each query.** This limit applies to rows that a query returns, updates, or deletes. `clear()` deletes a namespace with one `DELETE`. `clearExpired()` and the `intervalExpiration` timer delete all expired rows with one `DELETE`. Each fails with `Row count exceeded 100000` when more than 100,000 rows match. See [PlanetScale database error reference](https://planetscale.com/docs/vitess/troubleshooting/errors). Set `intervalExpiration` short enough that each run deletes fewer rows.
- **64 MiB for each result set and each query.** `setMany()` sends one `INSERT`. `getMany()` sends one `SELECT`, and then one `DELETE` if it finds expired keys. Keep each batch below this size. The iterator reads `iterationLimit` rows in each query.
- **20 seconds for each transaction.** The [v6 migration script](#running-the-migration-script) runs the namespace `UPDATE` in one transaction. After that transaction, a different `UPDATE` fills `expires`. The script does not run this second `UPDATE` when it finds no namespace rows to migrate. In that case, run the second `UPDATE` yourself, as shown after this list. On a large v5 table, the first `UPDATE` can go above the 20-second limit. Each `UPDATE` can go above the row limit.

This is the `UPDATE` that the script uses to fill `expires`. Replace `keyv` with your table name:

```sql
UPDATE keyv
SET expires = CAST(value->'$.expires' AS UNSIGNED)
WHERE expires IS NULL AND JSON_VALID(value) AND value->'$.expires' IS NOT NULL;
```

If more than 100,000 rows match, add `LIMIT 100000`. Run the statement again until it changes no rows.

This section is for the default unsharded keyspace. No test ran the adapter on a sharded keyspace. See [Keyspaces](https://planetscale.com/docs/vitess/sharding/keyspaces).

### Example

```js
import Keyv from 'keyv';
import KeyvMysql from '@keyv/mysql';

const user = encodeURIComponent(process.env.PLANETSCALE_USERNAME);
const password = encodeURIComponent(process.env.PLANETSCALE_PASSWORD);
const uri = `mysql://${user}:${password}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}`;

const store = new KeyvMysql({
	uri,
	ssl: { rejectUnauthorized: true, verifyIdentity: true },
	connectionLimit: 5,
});
const keyv = new Keyv({ store });
keyv.on('error', (error) => console.error('Keyv PlanetScale error', error));

await keyv.set('greeting', 'hello', 60_000);
console.log(await keyv.get('greeting')); // 'hello'

await keyv.disconnect();
```

Use an Admin password for a branch that accepts DDL. See [Branches, safe migrations, and the table](#branches-safe-migrations-and-the-table). When an `error` listener is attached, a failed operation emits `error` and returns a fallback value, such as `undefined` from `get()`. Without a listener, the operation rejects.

### Troubleshooting

- **No TLS.** PlanetScale requires SSL, so a connection without the `ssl` option fails. The adapter ignores `?ssl=...` in `uri`. Set the `ssl` option.
- **CA errors.** The error `self-signed certificate in certificate chain` or `unable to get local issuer certificate` means that Node.js cannot find the CA. If you set `ssl.ca`, use the complete system CA file from [CA root configuration](https://planetscale.com/docs/vitess/connecting/secure-connections#ca-root-configuration).
- **Host name errors.** The error `Hostname/IP does not match certificate's altnames` comes from `verifyIdentity`. It means that the host in `uri` is not the name in the certificate. Use the host from the **Connect** page.
- **Access denied on a branch.** A password works only on its branch. Make sure that the branch in **Settings** > **Passwords** is the branch that you want. PlanetScale disconnects clients that use a deleted password in five minutes or less. A password with IP restrictions refuses connections from other IP ranges. See [Connection strings](https://planetscale.com/docs/vitess/connecting/connection-strings).
- **`branch is missing or sleeping`.** The branch is deleted or [sleeping](https://planetscale.com/docs/plans/database-sleeping). See [PlanetScale database error reference](https://planetscale.com/docs/vitess/troubleshooting/errors).
- **The table is not created.** The error `DDL command denied to user` means that the password role cannot change the schema. Use an Admin password. The error `direct DDL is disabled` ([Branching](https://planetscale.com/docs/vitess/schema-changes/branching)) or `Data Definition Language is not supported on branches with safe migrations enabled.` ([error reference](https://planetscale.com/docs/vitess/troubleshooting/errors)) means that safe migrations are on for the branch. A table from a deploy request does not prevent this error. See [Branches, safe migrations, and the table](#branches-safe-migrations-and-the-table).
- **`Row count exceeded 100000`.** A `clear()` or expiration `DELETE` matched more than 100,000 rows. See [Vitess and PlanetScale limits](#vitess-and-planetscale-limits).
- **`transaction pool connection limit exceeded`.** Decrease `connectionLimit` or the number of processes. You can also use a larger cluster size. See [Connection pooling and limits](#connection-pooling-and-limits).

## License

[MIT © Jared Wray](LICENSE)
