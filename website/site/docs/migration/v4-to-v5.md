---
title: 'v4 to v5 Migration'
sidebarTitle: 'v4 to v5'
parent: 'Migration'
order: 1
---

# v4 to v5 Migration

Keyv v5 is a major release with breaking changes. The biggest one is that Keyv no longer loads storage adapters from a connection string. This page covers what changed from v4 to v5.

**Still on v4? Go straight to v6.** Apply this page, then the [v5 to v6 guide](/docs/migration/v5-to-v6/). See [Going Straight from v4 to v6](#going-straight-from-v4-to-v6) for the parts that differ for v4 data.

> **Using an AI coding agent?** Tell it: *"Upgrade this project to Keyv v6 using https://keyv.org/skills/migrate"*. The skill handles v4 projects too. See [Migrate with an AI Agent](/docs/migration/ai-agent-skill/).

## Pass a Storage Adapter Instead of a Connection String

### Before with v4
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv('redis://user:pass@localhost:6379');
```

v4 read the scheme from the string, or from the `adapter` option, and loaded the matching `@keyv/*` package for you. Now you pass the store either directly to the constructor, as below, or in the `store` option. The constructor takes the storage adapter or the options as the first parameter.

**Watch out:** v5 and v6 don't reject a connection string. `new Keyv('redis://...')` and `new Keyv({ uri: 'redis://...' })` silently fall back to an in-memory store, and TypeScript accepts both forms. Search your code for every place that builds a Keyv from a string.

### Now with v5
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379'));
```

## An example with options
When passing in options you can do the following using the `store` parameter:
```js
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
const keyv = new Keyv(new KeyvRedis('redis://user:pass@localhost:6379',{ namespace: 'my-namespace' }));
```

v4 also passed any extra Keyv options through to the adapter, as in `new Keyv({ uri: 'sqlite://cache.sqlite', table: 'cache' })`. Give adapter options to the adapter instead:

```js
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
const keyv = new Keyv(new KeyvSqlite({ uri: 'sqlite://cache.sqlite', table: 'cache' }));
```

## CommonJS Imports Changed

v4 exported the class as the module itself (`module.exports = Keyv`). From v5 on, `keyv` exports `Keyv` as a named export and as `default`, so the v4 form fails with `Keyv is not a constructor`:

```js
// v4
const Keyv = require('keyv');

// v5 and later
const { Keyv } = require('keyv');
// or
const Keyv = require('keyv').default;
```

Adapters changed the same way. In v6 most adapters also export their class by name, such as `const { KeyvSqlite } = require('@keyv/sqlite')`. `@keyv/redis` has only a default export, so use `const KeyvRedis = require('@keyv/redis').default`.

## `@keyv/offline` and `@keyv/tiered` Were Removed

`@keyv/offline` and `@keyv/tiered` are gone, along with the `offline:` and `tiered:` connection strings. For a fast in-memory layer in front of a remote store, or for offline fallbacks, use [Cacheable](https://cacheable.org).

## `@keyv/redis` Uses the Official Redis Client

The v4-era `@keyv/redis` 2.x was built on `ioredis`. Since Keyv v5, `@keyv/redis` uses the official `redis` client (`@redis/client`). You can't pass an `ioredis` instance or `ioredis`-only options anymore. Pass a connection string or `redis` client options, or create a client with the `createClient`, `createCluster`, or `createSentinel` functions that `@keyv/redis` exports. See [@keyv/redis](/docs/storage-adapters/redis/).

## Other Changes

- **TypeScript and ESM.** v5 is written in TypeScript and ships ESM and CommonJS builds with its own types. v4's `Keyv<Value, Options>` type took an options parameter; v5 and v6 take only the value type, as in `Keyv<Value>`.
- **Return values.** v4's `set` always resolved `true`. Now a failed write is reported; v6 [returns `false` or rejects](/docs/migration/v5-to-v6/#error-handling-changed-and-throwonerrors-was-removed) depending on whether an `error` listener is attached. `has` also accepts an array of keys, and `hasMany` was added.
- **Raw values.** v4 stored `expires: null` for entries without a TTL. v5 and v6 leave `expires` out, so check `expires === undefined` rather than `=== null`.
- **Serialization.** v4 serialized with `json-buffer`. v5 used `@keyv/serialize`, and v6 has a built-in serializer. All three write the same format, so data v4 wrote without compression can still be read.
- **Compression.** In v4, a compression adapter replaced `serialize` and `deserialize` entirely. v6 can't read values that v4 compressed.
- **Events.** v4 extended Node.js's `EventEmitter`. v5 has its own event emitter, and v6 uses [Hookified](https://hookified.org). In v4, `emitErrors` could only be set in the constructor; v6 removed it.
- **Iterator.** v4 attached `iterator` only for a `Map` and some adapters, and you passed it the namespace: `keyv.iterator(keyv.opts.namespace)`. In v6, `keyv.iterator()` always exists and takes no arguments.

## Removing support for Nodejs 18 and below

We have stopped testing on Nodejs 18 and below and while we do not force or require you to use Nodejs 20+ we do recommend it. Keyv v6 requires Node.js 22.19 or later.

## Going Straight from v4 to v6

Apply this page first, then the [v5 to v6 guide](/docs/migration/v5-to-v6/). Most of that guide applies to v4 projects as written, including the table for [keeping existing data readable](/docs/migration/v5-to-v6/#the-default-keyv-namespace-was-removed). v4 stored keys the same way v5 did for SQLite, PostgreSQL, MySQL, MongoDB, Etcd, and Memcache, so use the "default" rows of that table.

Redis is different. `@keyv/redis` 2.x, the version used with Keyv v4, stored Keyv's key without adding a prefix of its own. In this table, `ns` is the namespace your v4 instance used, which is `keyv` unless you set one:

| v4 setup | Key v4 stored for `foo` | v6 setting that reads it |
| --- | --- | --- |
| default | `ns:foo` | `namespace: 'ns'` with `new KeyvRedis(uri, { keyPrefixSeparator: ':' })` |
| `useRedisSets: false` | `sets:namespace:ns:ns:foo` | `namespace: 'sets:namespace:ns:ns'` with `new KeyvRedis(uri, { keyPrefixSeparator: ':' })` |

v4's Redis adapter also kept a Redis set named `namespace:ns` that listed its keys. v6 doesn't use it, so you can delete it once nothing runs v4.

Values that v4 wrote with compression can't be read by v6. Treat them as a cache to repopulate.

# New Features
Here are a list of new features in Keyv v5:
- **Typescript Support**: Keyv v5 is written in Typescript and has full typescript support.
- **ESM Support**: Keyv v5 is written in ESM and has full ESM support.
- **Event Emitter**: Keyv v5 is now an event emitter and emits events for `set`, `delete`, `clear`, and `error` with no reliance on third party libraries.
- **Built in Statistics**: Keyv v5 has built in statistics for `hits`, `misses`, `sets`, `deletes`, and `errors`.
- **Hooks**: Keyv v5 has hooks for pre and post processing on `set()`, `get()`, `getMany()`, and `delete()`.

You can learn about any of these features in the Keyv API documentation.
