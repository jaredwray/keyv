---
name: keyv-migrate
description: Migrates a JavaScript or TypeScript project from Keyv v4 or v5 to Keyv v6. Upgrades keyv and every @keyv/* package to one matching v6 version, rewrites removed and changed APIs (connection-string constructors, opts, serialize/deserialize, useKeyPrefix, hooks, throwOnErrors/emitErrors, raw gets, setMany/deleteMany results, iterator, custom storage adapters, @keyv/test-suite), and keeps data already stored in Redis, Valkey, Memcache, SQLite, PostgreSQL, MySQL, MongoDB, Etcd, and DynamoDB readable by choosing matching namespace settings. Use when asked to upgrade, migrate, or bump keyv or @keyv/* packages, or when code breaks or cached data goes missing after installing Keyv v6.
license: MIT
metadata:
  author: jaredwray
  source: https://github.com/jaredwray/keyv/tree/main/skills/keyv-migrate
  target: keyv 6.0.0 or later
---

# Migrate to Keyv v6

This skill upgrades a project that uses Keyv v4 or v5 to Keyv v6 (6.0.0 or later). Work through the steps in order. Don't skip step 2: the most damaging v6 changes don't fail to compile and don't throw. They make stored data look missing.

## Reference files

Read a reference file when a step points to it. If you loaded this skill from a URL instead of from disk, fetch the files from keyv.org:

| File | Read it for | URL |
| --- | --- | --- |
| [references/find-usages.md](references/find-usages.md) | Search patterns for every change | https://keyv.org/skills/keyv-migrate/references/find-usages.md |
| [references/dependencies.md](references/dependencies.md) | Picking the v6 version, package changes, Node.js, libraries that embed Keyv | https://keyv.org/skills/keyv-migrate/references/dependencies.md |
| [references/stored-data.md](references/stored-data.md) | Keeping existing data readable, per adapter | https://keyv.org/skills/keyv-migrate/references/stored-data.md |
| [references/v4-to-v5.md](references/v4-to-v5.md) | Changes a v4 project needs first | https://keyv.org/skills/keyv-migrate/references/v4-to-v5.md |
| [references/v5-to-v6.md](references/v5-to-v6.md) | Core API changes, before and after | https://keyv.org/skills/keyv-migrate/references/v5-to-v6.md |
| [references/adapters.md](references/adapters.md) | Changes in each `@keyv/*` package | https://keyv.org/skills/keyv-migrate/references/adapters.md |
| [references/custom-adapters.md](references/custom-adapters.md) | Custom storage adapters and their tests | https://keyv.org/skills/keyv-migrate/references/custom-adapters.md |

## Ground rules

- **Never touch stored data without approval.** Don't run migration scripts, don't delete or rename keys, and don't point v6 at a real SQLite, PostgreSQL, MySQL, or MongoDB store. SQLite converts its table the first time v6 connects, and every conversion is one-way. Propose the command, ask for a backup, and wait for the user to agree.
- **Don't trust the compiler.** In v6, `new Keyv('redis://…')` quietly uses memory, removed options are ignored in JavaScript, and `if (await keyv.deleteMany(keys))` is always true. Use the searches in find-usages.md.
- **Change only Keyv code.** Keep the project's module system (ESM or CommonJS), package manager, and code style. Don't upgrade unrelated dependencies.
- **Stop when Keyv is only a transitive dependency.** If no package.json in the project lists `keyv` or an `@keyv/*` package, Keyv is only there because another library (such as `got` or `cache-manager`) depends on it. There is nothing to migrate. Tell the user, and never force v6 in with `overrides` or `resolutions`.
- **Ask when unsure.** When a decision depends on what the data is or how the app is deployed, ask the user instead of guessing.

## Step 1: Take inventory

1. Find every package.json (in monorepos too) that lists `keyv` or an `@keyv/*` package, and read the installed versions from the lockfile.
2. Classify each one: v4 (`keyv` 4.x), v5 (`keyv` 5.x), or already v6. A v4 project follows both v4-to-v5.md and v5-to-v6.md.
3. List every place that creates a Keyv instance: the store it uses, its namespace, and whether it uses compression, custom serialization, hooks, or stats.
4. Find custom storage adapters (a class or object with `get`, `set`, `delete`, and `clear` passed as a store) and tests that use `@keyv/test-suite`.
5. Check for libraries that embed Keyv v5, such as `cache-manager` or `cacheable`, and whether the project passes Keyv instances or `@keyv/*` adapters to them. See dependencies.md. If it does, stop and ask the user how to proceed.
6. Run the searches in find-usages.md and keep the list of hits.
7. Show the user a short inventory before you change anything.

## Step 2: Decide what happens to stored data

This step blocks the rest. For each Keyv instance:

1. Is the store persistent or shared (Redis, Valkey, Memcache, a SQL database, MongoDB, Etcd, DynamoDB, Cloudflare KV)? An in-process `Map` needs no data decision.
2. Is it a cache that can be rebuilt, or data that must survive the upgrade? Ask the user unless the code makes it obvious.
3. If the data must survive, find the v6 settings that read the old keys in stored-data.md, based on the adapter, the old Keyv version, and the old namespace setup. Note any migration script the user must run.
4. If the instance used compression, v6 can't read the old entries. Say so: that data has to be repopulated.
5. Either way, keep a namespace on shared backends. With no namespace, `clear()` can wipe a whole Redis, Valkey, or Etcd database, or a whole DynamoDB table.

Write down the decision for each instance. You will report it in step 6.

## Step 3: Upgrade dependencies

Follow dependencies.md:

1. Confirm the runtime is Node.js 22.19 or later. Also check `engines`, `.nvmrc`, Dockerfiles, and CI. If the project targets an older version, tell the user; don't change runtime pins without asking.
2. Pick one exact v6 version for everything: the highest version that `npm view "keyv@>=6.0.0-0 <7" version --json` lists. Confirm that every `@keyv/*` package the project uses has that version. If it is a pre-release, tell the user.
3. Set `keyv` and every `@keyv/*` dependency to that version with the project's package manager. Remove `@keyv/serialize`, `@keyv/offline`, and `@keyv/tiered`, and add any replacement the code needs.

## Step 4: Rewrite the code

Fix each hit from step 1. A v4 project applies v4-to-v5.md first. Then apply v5-to-v6.md, adapters.md for each package in use, and custom-adapters.md if the project has its own adapter or adapter tests.

The most common changes:

| v4 or v5 | v6 |
| --- | --- |
| `new Keyv('redis://…')` or `new Keyv({ uri })` | `new Keyv(new KeyvRedis('redis://…'))` |
| `const Keyv = require('keyv')` | `const { Keyv } = require('keyv')` |
| no namespace (v4 and v5 used `keyv`) | the namespace from step 2, such as `{ namespace: 'keyv' }` |
| `keyv.opts.namespace` | `keyv.namespace` |
| `serialize` / `deserialize` options | `serialization: { stringify, parse }`, or remove them to use the built-in JSON serializer |
| `useKeyPrefix`, `emitErrors`, `throwOnErrors` options | remove them (keep `throwOnErrors` passed to `KeyvRedis` itself) |
| no `error` listener | `keyv.on('error', …)` wherever failures should become fallback values |
| `keyv.hooks.addHandler(KeyvHooks.PRE_SET, fn)` | `keyv.onHook(KeyvHooks.BEFORE_SET, fn)` |
| `get(key, { raw: true })` | `getRaw(key)` |
| `getMany(keys, { raw: true })` | `getManyRaw(keys)` |
| `if (await keyv.deleteMany(keys))` | `if ((await keyv.deleteMany(keys)).every(Boolean))` |
| `keyv.iterator(keyv.namespace)` | `keyv.iterator()` |
| `value === null` after `get` | `value === undefined` |
| custom adapter `set(key, value, ttl)` | `set(key, value, expires)` with an absolute timestamp |

Make the smallest change that keeps the app's behavior. Where v6 behaves differently on purpose, such as calls rejecting when no `error` listener is attached, choose what the app relied on and explain the choice in your report.

## Step 5: Verify

1. Run the project's typecheck, lint, and tests. Fix what fails.
2. Run the searches in find-usages.md again. Removed APIs should have no hits left, and every remaining hit needs a reason.
3. Check that each Keyv instance uses the intended store. `keyv.store` is a `KeyvMemoryAdapter` when Keyv fell back to memory, for example because it got a connection string. That is only correct for an instance that was meant to use a `Map`.
4. If the user has a development or staging store with old data and agrees to it, read a known key through the new settings and confirm the value comes back.

## Step 6: Report

Tell the user:

- The Keyv versions before and after, and the exact v6 version pinned.
- The files you changed, grouped by kind of change.
- The stored-data decision for each Keyv instance, and the settings that carry it out.
- The manual steps left: migration scripts to run (after a backup), a Node.js upgrade, the deploy order (stop v5 writers first, no rolling deploy that mixes v5 and v6), and libraries that still need Keyv v6 support.
- Where to read more: https://keyv.org/docs/migration/v5-to-v6/ and https://keyv.org/docs/migration/v4-to-v5/.
