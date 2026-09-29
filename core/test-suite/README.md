# @keyv/test-suite [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Test suite for Keyv API compliance

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/test-suite.svg)](https://www.npmjs.com/package/@keyv/test-suite)
[![npm](https://img.shields.io/npm/dm/@keyv/test-suite)](https://npmjs.com/package/@keyv/test-suite)

Complete [Vitest](https://vitest.dev/) test suite to test a [Keyv](https://github.com/jaredwray/keyv) storage adapter for API compliance.

## Usage

### Install

Install `vitest`, `keyv` and `@keyv/test-suite` as development dependencies.

```shell
npm install --save-dev vitest keyv @keyv/test-suite
```

Then update `keyv` and `@keyv/test-suite` versions to `*` in `package.json` to ensure you're always testing against the latest version.

### Create Test File

`test.js`

```js
import { keyvTestSuite, storageTestSuite } from '@keyv/test-suite';
import { Keyv } from 'keyv';
import { test } from 'vitest';
import KeyvStore from './src/index.js';

const store = () => new KeyvStore();
keyvTestSuite(test, Keyv, store);
storageTestSuite(test, store);
```

Where `KeyvStore` is your storage adapter. `keyvTestSuite` tests the adapter through a `Keyv` instance, and `storageTestSuite` tests it directly (see [Storage Adapter Tests](#storage-adapter-tests)). If your adapter implements `iterator()`, also import and call `keyvIteratorTests(test, Keyv, store)`.

Set your test script in `package.json` to `vitest`.
```json
"scripts": {
  "test": "vitest"
}
```

## Example for Storage Adapters

Take a look at [keyv/redis](https://github.com/jaredwray/keyv/tree/main/storage/redis) for an example of an existing storage adapter using `@keyv/test-suite`.

## Storage Adapter Tests

To test a storage adapter directly (without the `Keyv` wrapper), use `storageTestSuite`. It runs basic CRUD, batch, iterator, TTL, namespace, and disconnect tests against the adapter:

```js
import { it } from 'vitest';
import { storageTestSuite } from '@keyv/test-suite';
import KeyvStore from './src/index.js';

const store = () => new KeyvStore();
storageTestSuite(it, store);
```

### Storage Test Options

`storageTestSuite` (and the individual `storage*Tests` functions) accept an options object as the third argument:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `missingValue` | `undefined \| null` | `undefined` | Value returned by `get()` for missing or expired keys |
| `basic` | `boolean` | `true` | Enable basic CRUD tests (`set`/`get`/`delete`/`has`/`clear`) |
| `batch` | `boolean` | `true` | Enable batch operation tests (`setMany`/`getMany`/`hasMany`/`deleteMany`) |
| `iterator` | `boolean` | `true` | Enable iterator tests |
| `ttl` | `boolean` | `true` | Enable TTL tests |
| `ttlGranularity` | `'milliseconds' \| 'seconds'` | `'milliseconds'` | TTL granularity used by the TTL tests |
| `namespace` | `boolean` | `true` | Enable namespace getter/setter test |
| `disconnect` | `boolean` | `true` | Enable disconnect test |

### TTL Granularity

By default the TTL tests use sub-second TTL values (300ms TTL with a 600ms expiry wait). Storage backends such as etcd (leases) and DynamoDB only support TTLs at second-level resolution, so they can't honor sub-second TTLs. For those adapters, set `ttlGranularity: 'seconds'` and the TTL tests will use second-scale values instead (1 second TTL with a 3 second expiry wait):

```js
import { it } from 'vitest';
import { storageTestSuite } from '@keyv/test-suite';
import KeyvStore from './src/index.js';

const store = () => new KeyvStore();
storageTestSuite(it, store, { ttlGranularity: 'seconds' });
```

Use `ttl: false` only when the adapter has no storage-level TTL support at all.

## Testing Compression Adapters

If you're testing a compression adapter, use `compressionTestSuite` instead of `keyvTestSuite`. It checks `compress`/`decompress` round trips and that the adapter works with a `Keyv` instance.

```js
import { compressionTestSuite } from '@keyv/test-suite';
import { it } from 'vitest';
import KeyvGzip from '@keyv/compress-gzip';

compressionTestSuite(it, new KeyvGzip());
```

## Migrating from v5

Keyv v5 adapters used `@keyv/test-suite` 2.x. To move to the v6 test suite:

- There is no default export. Import `keyvTestSuite` and the other suites by name.
- The first argument is Vitest's `test` (or `it`) function. Version 2.x took the whole Vitest module (`import * as test from 'vitest'`).
- `keyvNamespaceTest` is now `keyvNamespaceTests`.
- `keyvCompresstionTests` is now `compressionTestSuite`.
- New suites: `storageTestSuite` tests an adapter directly, without `Keyv`. It runs `storageBasicTests`, `storageBatchTests`, `storageIteratorTests`, `storageTtlTests`, `storageNamespaceTests` and `storageDisconnectTests`, which are also exported. `encryptionTestSuite(test, adapter)` and `serializationTestSuite(test, adapter)` test encryption and serialization adapters.

## License

[MIT © Jared Wray](LICENSE)
