# @keyv/fs [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> File system storage adapter for [Keyv](https://github.com/jaredwray/keyv): keep a store in one file or in a directory, with atomic writes

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/fs.svg)](https://www.npmjs.com/package/@keyv/fs)
[![npm](https://img.shields.io/npm/dm/@keyv/fs)](https://npmjs.com/package/@keyv/fs)

## Features

- Two storage strategies: `"file"` keeps the whole store in one file, and `"directory"` keeps one file per key
- Atomic writes: a write goes to a temporary file that is renamed into place, so a crash never leaves a half-written store
- `await keyv.set()` resolves once the value is on disk, and writes made together share one save
- Namespaces never overlap, and `clear()` only removes the current namespace
- Damaged data is moved aside and reported, never silently overwritten
- Expired entries are never returned, and are swept from disk
- Every instance on the same path in a process shares one store, so instances can't overwrite each other
- Native Keyv v6 adapter: absolute expiry, batch methods, iterator
- Full TypeScript support, ESM and CommonJS

## Table of Contents

- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Strategies](#strategies)
  - [The file strategy](#the-file-strategy)
  - [The directory strategy](#the-directory-strategy)
  - [Choosing a strategy](#choosing-a-strategy)
- [Usage with Namespaces](#usage-with-namespaces)
- [Options](#options)
- [Expiry](#expiry)
- [Durability](#durability)
- [Multiple Processes](#multiple-processes)
- [Errors and Damaged Data](#errors-and-damaged-data)
- [Migrating from keyv-file](#migrating-from-keyv-file)
- [Benchmarks](#benchmarks)
- [Properties](#properties)
- [Methods](#methods)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/fs
```

## Quick Start with createKeyv

```js
import { createKeyv } from '@keyv/fs';

const keyv = createKeyv('./cache/keyv.jsonl');

await keyv.set('foo', 'bar');
await keyv.get('foo'); // 'bar'

// Save pending writes before the process exits.
await keyv.disconnect();
```

## Usage

```js
import Keyv from 'keyv';
import KeyvFs from '@keyv/fs';

// One file for the whole store (the default strategy).
const keyv = new Keyv({ store: new KeyvFs('./cache/keyv.jsonl') });

// One file per key.
const files = new Keyv({ store: new KeyvFs({ path: './cache/keyv', strategy: 'directory' }) });
```

`path` is required. Parent directories are created on the first write. Nothing touches the disk until the first operation.

## Strategies

Both strategies store the same thing: for each key, its namespace, its value as Keyv serialized it, and its expiry. They differ in how they lay it out on disk.

The examples below run this script against each strategy:

```js
const a = new Keyv({ store: new KeyvFs({ path, strategy }) });                      // no namespace
const u = new Keyv({ store: new KeyvFs({ path, strategy }), namespace: 'users' });  // same store
await a.set('a', 'hello');            // ① the adapter receives '{"value":"hello"}'
await u.set('b', { x: 1 }, 60_000);   // ② the adapter receives '{"value":{"x":1},"expires":…}'
await a.delete('a');                  // ③
await u.clear();                      // ④ clears "users" only
```

### The file strategy

`path = ./cache/keyv.jsonl`. The whole store lives in one file and is loaded into memory.

| File | When it exists |
| --- | --- |
| `cache/keyv.jsonl` | The store, once something has been written |
| `cache/keyv.jsonl.<pid>.<random>.tmp` | Only during a save. It is renamed over the store file. |
| `cache/keyv.jsonl.corrupt-<time>-<random>` | Only after a damaged file was moved aside |

- **Load** happens on the first operation. Leftover temporary files from an interrupted save are removed, then `keyv.jsonl` is read line by line into memory.
- **Read** (`get`, `has`, `getMany`, `iterator`) comes from memory, with no disk access.
- **Write** (`set`, `delete`, `clear`) changes memory, then waits for a save. A save writes the whole store to a temporary file and renames it over `keyv.jsonl`, so the file is always either the old store or the new one. Writes made in the same tick (or within `writeDelay`) share one save, and the awaited call resolves once its save is done.

The file is [JSON Lines](https://jsonlines.org/): a header, one line per entry, and a checkpoint with the number of entries. After each step of the script:

```
①  {"format":"keyv-fs","kind":"file","version":1}
    {"op":"set","k":"a","s":"{\"value\":\"hello\"}"}
    {"op":"checkpoint","count":1}
②  {"format":"keyv-fs","kind":"file","version":1}
    {"op":"set","k":"a","s":"{\"value\":\"hello\"}"}
    {"op":"set","n":"users","k":"b","e":1760000660000,"s":"{\"value\":{\"x\":1},\"expires\":1760000660000}"}
    {"op":"checkpoint","count":2}
③  header, the "users" entry b, checkpoint 1
④  header, checkpoint 0
```

`n` is the namespace, `k` the key and `e` the expiry in Unix milliseconds. The value is in `s` (a string, as Keyv's serializer produces), `j` (any other value, when Keyv's serialization is off) or `u` (`undefined`). Name the file `.jsonl`: many `.gitignore` files and log rotators match `*.log`.

### The directory strategy

`path = ./cache/keyv`. Each key is a file, and nothing is held in memory. After step ② of the script:

```
cache/keyv/
  keyv-fs.json                          {"format":"keyv-fs","kind":"directory","version":1}
  data/
    _/<h1:2>/<h1>.kv                     entries with no namespace; h1 = sha256("a")
    n-<sha256("users")>/<h2:2>/<h2>.kv   entries in "users"; h2 = sha256("b")
  tmp/                                  writes in progress
  trash/                                cleared namespaces being removed
```

File names are SHA-256 hashes, sharded into 256 directories by their first two characters. That keeps them short and safe on every file system whatever the key: no path traversal, no collisions between keys that differ only in case, no reserved names. An entry file is a header line followed by the raw value, so the value is not escaped twice:

```
{"format":"keyv-fs","kind":"entry","version":1,"k":"b","n":"users","e":1760000660000,"t":"s"}
{"value":{"x":1},"expires":1760000660000}
```

- **Load** happens on the first operation. It creates the marker file and the `data`, `tmp` and `trash` directories, and removes what an earlier run left in `tmp` and `trash`. Nothing is read into memory.
- **Read** reads the key's file and checks that its header names the same key and namespace. An expired entry is deleted and reported as missing.
- **Write** writes the entry to `tmp/`, then renames it into `data/`, so a reader sees the old entry or the new one.
- **Delete** removes the key's file.
- **Clear** renames the namespace's directory into `trash/` (one step, whatever its size), then removes it.
- **Iterator** walks the namespace's directory.

### Choosing a strategy

| | `"file"` | `"directory"` |
| --- | --- | --- |
| Files | 1 | 1 per key, plus the marker |
| Each write | Rewrites the whole file (writes made together share one save) | Writes one small file |
| Reads | From memory | From disk |
| Memory | The whole store | None |
| Opening | Reads the whole file | Nothing to read |
| Several processes | Not supported (see [Multiple Processes](#multiple-processes)) | Supported, the last write to a key wins |
| Best for | Small to medium stores: config, caches, CLI state | Large stores, large values, several processes |

The `"file"` strategy matches keyv-file's default mode, and `"directory"` matches its `separatedFile` mode.

## Usage with Namespaces

```js
import Keyv from 'keyv';
import KeyvFs from '@keyv/fs';

const users = new Keyv({ store: new KeyvFs('./cache/keyv.jsonl'), namespace: 'users' });
const posts = new Keyv({ store: new KeyvFs('./cache/keyv.jsonl'), namespace: 'posts' });

await users.set('1', { name: 'Ada' });
await posts.set('1', { title: 'Hello' });
await users.clear(); // posts are kept
```

The namespace is stored next to the key, not in front of it, so namespaces never overlap: `a` and `a::b` are kept apart, and so are the key `x` in `a::b` and the key `b::x` in `a`. There is no `namespaceSeparator` option.

`clear()` removes the current namespace's entries. With no namespace, it removes only the entries that have no namespace, as `@keyv/sqlite` does. `iterator()` is scoped the same way. An empty namespace (`""`) is the same as none.

## Options

```js
new KeyvFs(path, options);
new KeyvFs({ path, ...options });
```

| Option | Default | Description |
| --- | --- | --- |
| `path` | (required) | The store file (`"file"` strategy) or directory (`"directory"` strategy). |
| `strategy` | `"file"` | `"file"` or `"directory"`. See [Strategies](#strategies). |
| `namespace` | `undefined` | The namespace for this instance. Keyv sets it for you when you pass `namespace` to Keyv. |
| `writeDelay` | `0` | `"file"` strategy only: milliseconds to wait before a save, so more writes share it. Writes made in the same tick always share a save. A write resolves once its data is in the file, so a higher value makes each awaited write slower. |
| `expiredCheckDelay` | `86400000` (24 hours) | The least time, in milliseconds, between sweeps that remove expired entries. A sweep runs after a write once this much time has passed since the store was loaded or last swept. |

Every instance on one path must use the same `strategy`, `writeDelay` and `expiredCheckDelay`; a different one throws.

## Expiry

Keyv passes each entry's expiry as an absolute time. The adapter stores it next to the value, and never returns an expired entry, whether or not Keyv's `checkExpired` is on.

Expired entries are also removed from disk:

- when a read finds one (the `"file"` strategy drops it from memory, and from the file at the next save);
- by a sweep after a write, at most once per `expiredCheckDelay` (24 hours by default);
- by every save of the `"file"` strategy, which leaves them out;
- when you call `clearExpired()`.

## Durability

- **Every write is atomic.** Data goes to a temporary file that is renamed into place. A process crash leaves the old data or the new data, never a mix.
- **`await` means saved.** `set`, `setMany`, `delete`, `deleteMany` and `clear` resolve once their change is in the file. Unawaited writes are saved too: a pending save keeps the process running until it is done.
- **Call `disconnect()` before `process.exit()`.** It waits for writes already called, saves them, and releases the store. `process.exit()` does not wait for anything.
- **No fsync.** Data reaches the operating system, not necessarily the disk. After a power loss or an operating system crash, the latest writes can be lost. A store file left damaged is moved aside (see below) and the store starts empty; a file left empty (0 bytes) is loaded as an empty store.
- **If a save fails** (for example, the disk is full), the write rejects. The value stays in memory and the next save retries it, so a write that rejected can still reach the file later. In the same way, `disconnect()` reports a failed save even when its retry then succeeded.

## Multiple Processes

Within one process, every `KeyvFs` on the same path shares one store, so they never overwrite each other. This works across CommonJS and ES module copies of the package too.

- **`"file"` strategy: one process per file.** Each process holds the whole store in memory and saves all of it, so two processes writing one file overwrite each other's changes. There is no lock; give each process its own file, or use the `"directory"` strategy. Worker threads count as separate processes.
- **`"directory"` strategy: several processes are fine.** Each write replaces one file atomically, and the last write to a key wins. Removing an expired entry never deletes a newer write from another process, though that process's readers may miss the key for a moment while it is checked. A `clear()` in one process and a `set` in another are not ordered.

Network file systems are not supported.

## Errors and Damaged Data

Errors follow Keyv's rules: a failed operation rejects, and Keyv emits the error on the Keyv instance. Attach a listener to the Keyv, not to the store:

```js
keyv.on('error', (error) => console.error(error));
```

**A file that isn't a @keyv/fs store** (for example, a keyv-file JSON file, or a newer format version) is never changed. Every operation rejects with `KeyvFsFormatError` until you point `path` at a new file or move that one away. The next operation tries again, so you don't need to restart.

**A damaged store file** (cut short, or with a line that doesn't parse) is renamed to `<path>.corrupt-<time>-<random>`, and the store starts empty. A `KeyvFsCorruptionError` with `quarantinePath` is emitted once, during the operation that found it. With an `error` listener that operation then succeeds; with none, that one operation rejects and the next succeeds. Nothing is lost: the damaged file is still there for you to inspect.

**A damaged entry file** (`"directory"` strategy) is treated as missing, and a `KeyvFsCorruptionError` is emitted each time it is read. The next write of that key replaces it, and deleting the key removes it.

Errors from the background expiry sweep go to `error` listeners, and are dropped when there are none. They never crash the process.

When you use the store directly, without Keyv, attach a listener to the store (`store.on('error', …)`), or a damaged file being moved aside goes unreported. Keyv attaches one for you.

## Migrating from keyv-file

| keyv-file | @keyv/fs |
| --- | --- |
| `new KeyvFile({ filename })` | `new KeyvFs(path)` |
| `filename` (defaults to a shared temp file) | `path` (required) |
| `separatedFile: true` | `strategy: 'directory'` |
| `writeDelay` (default `100`) | `writeDelay` (default `0`) |
| `expiredCheckDelay` | `expiredCheckDelay` (same default and meaning) |
| `serialize` / `deserialize` (`encode` / `decode` in its README) | Not needed: Keyv serializes. Use Keyv's `serialization` option. |
| `checkFileLock` | Not available. Instances in one process share a store. |
| `keys()`, `getSync()` | `iterator()`, `get()` |

@keyv/fs does not read keyv-file's files. To bring the data over, copy it through Keyv once, keeping each entry's expiry:

```js
import Keyv from 'keyv';
import { KeyvFile } from 'keyv-file';
import KeyvFs from '@keyv/fs';

const source = new Keyv({ store: new KeyvFile({ filename: './cache/keyv-file.json' }), namespace: 'cache' });
const target = new Keyv({ store: new KeyvFs('./cache/keyv.jsonl'), namespace: 'cache' });

for await (const [key] of source.iterator()) {
	const raw = await source.getRaw(key); // { value, expires }
	if (raw) {
		await target.setRaw(key, raw);
	}
}

await target.disconnect();
```

Use the same `namespace` you used with keyv-file, and run it once for each namespace.

## Benchmarks

`@keyv/fs` against [keyv-file](https://github.com/zaaack/keyv-file) 5.3.5, each through `new Keyv({ store })` with Keyv's default serializer, as an app would use them. Values are random paragraphs of about 450 bytes. Each table starts from a store of that many entries.

<!-- BENCHMARK-RESULTS-START -->
### 1,000 entries

| Scenario (ops/sec, higher is better) | @keyv/fs file | @keyv/fs directory | keyv-file | keyv-file separatedFile | keyv-file default writeDelay (100 ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| set (overwrite) | 654 | 2.0K | 271 | **2.9K** | 9.6 |
| get (hit) | 345K | 6.3K | **505K** | 6.5K | — |
| get (miss) | 288K | 16K | **383K** | 17K | — |
| set + get | 563 | 1.2K | 284 | **1.7K** | — |
| getMany (100 keys) | 6.5K | 110 | **7.0K** | 110 | — |
| setMany (100 keys) | **471** | 44 | 2.7 | 26 | — |
| delete + set | 308 | 1.4K | 131 | **2.5K** | — |
| 100 concurrent sets | **389** | 51 | 245 | 104 | 9.6 |
| open + first get | 484 | 2.5K | 460 | **5.6K** | 576 |
| Disk use | 222 KB in 1 file | 254 KB in 1,001 files | 214 KB in 1 file | 173 KB in 1,001 files | 214 KB in 1 file |

### 10,000 entries

| Scenario (ops/sec, higher is better) | @keyv/fs file | @keyv/fs directory | keyv-file | keyv-file separatedFile | keyv-file default writeDelay (100 ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| set (overwrite) | 119 | 2.9K | 50 | **4.2K** | 8.2 |
| get (hit) | **322K** | 6.2K | 260K | 6.1K | — |
| get (miss) | **323K** | 15K | 255K | 16K | — |
| set + get | 118 | **1.6K** | 48 | 1.6K | — |
| getMany (100 keys) | **5.7K** | 107 | 5.2K | 109 | — |
| setMany (100 keys) | **113** | 69 | 0.5 | 28 | — |
| delete + set | 56 | 1.3K | 24 | **1.9K** | — |
| 100 concurrent sets | **105** | 45 | 39 | 94 | 8.0 |
| open + first get | 52 | 2.5K | 39 | **4.9K** | 43 |
| Disk use | 2.2 MB in 1 file | 2.5 MB in 10,001 files | 2.1 MB in 1 file | 1.7 MB in 10,001 files | 2.1 MB in 1 file |

Measured with Node.js v22.22.0, linux x64, Intel(R) Xeon(R) Processor @ 2.10GHz.
<!-- BENCHMARK-RESULTS-END -->

Notes on reading the numbers:

- **keyv-file trades safety for speed.** It writes files in place, without a temporary file and rename, so a crash during a write can leave a cut-short file that it then loads as an empty store. @keyv/fs pays for an extra rename on every write.
- **keyv-file has no `setMany`.** Through Keyv, its `setMany` sets the entries one at a time, and each set saves the whole file.
- **keyv-file's default `writeDelay` is 100 ms**, so each awaited write takes at least that long; that column shows it. The other keyv-file columns use `writeDelay: 0`, which still waits for a `setTimeout`. @keyv/fs uses `setImmediate`.
- **`get` from the `"file"` strategy and keyv-file's single file both come from memory**, so those rows mostly measure Keyv and the adapter's own overhead.
- The numbers depend on the machine and on its file system cache. Run them yourself with `pnpm benchmark` in this package (`pnpm benchmark --large` adds 100,000 entries).

## Properties

### .path

The store's absolute path. Read-only.

### .strategy

`"file"` or `"directory"`. Read-only.

### .writeDelay

The `writeDelay` option. Read-only.

### .expiredCheckDelay

The `expiredCheckDelay` option. Read-only.

### .namespace

The namespace for this instance. Keyv sets it when you pass `namespace` to Keyv.

### .capabilities

Declares the Keyv v6 storage contract, so Keyv uses the adapter directly.

## Methods

### constructor(path, options?)

Creates a store at `path`. Pass the options as a second argument, or pass one object with `path` in it. Throws a `TypeError` for an invalid option, and an `Error` when the path is already open in this process with a different `strategy`, `writeDelay` or `expiredCheckDelay`.

### .get(key)

Returns the value for `key`, or `undefined` when it is missing or expired.

### .getMany(keys)

Returns the values for `keys` in the same order, with `undefined` for missing or expired keys.

### .set(key, value, expires?)

Stores `value` and resolves to `true` once it is on disk. `expires` is an absolute time in Unix milliseconds; a time that has passed deletes the key. Rejects with a `TypeError` for a value that can't be stored (a function, a symbol, or a circular value), without changing anything.

### .setMany(entries)

Stores `{ key, value, expires? }` entries and resolves to `true` for each once they are on disk.

### .delete(key)

Deletes `key`. Resolves to whether it existed and had not expired.

### .deleteMany(keys)

Deletes `keys`. Resolves to a boolean for each key.

### .clear()

Deletes every entry in the current namespace, or every entry with no namespace when none is set.

### .has(key)

Whether `key` exists and has not expired.

### .hasMany(keys)

Whether each key exists and has not expired.

### .iterator()

An async iterator of `[key, value]` pairs in the current namespace, skipping expired entries.

```js
for await (const [key, value] of store.iterator()) {
	console.log(key, value);
}
```

### .flush()

Resolves once every write already called through this instance is on disk, without waiting out `writeDelay`.

### .clearExpired()

Removes expired entries from every namespace now, instead of waiting for the next sweep.

### .disconnect()

Waits for writes already called, saves them, and releases this instance. The last instance on a path closes the store. Call it before the process exits. Calling it again resolves; other methods reject afterwards.

## License

[MIT © Jared Wray](LICENSE)
