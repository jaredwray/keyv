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
import test from 'vitest';
import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvStore from './';

const store = () => new KeyvStore();
keyvTestSuite(test, Keyv, store);
```

Where `KeyvStore` is your storage adapter.

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
import KeyvStore from './';

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

By default the TTL tests use sub-second TTL values (100ms TTL with a 200ms expiry wait). Storage backends such as etcd (leases) and DynamoDB only support TTLs at second-level resolution, so they can't honor sub-second TTLs. For those adapters, set `ttlGranularity: 'seconds'` and the TTL tests will use second-scale values instead (1 second TTL with a 3 second expiry wait):

```js
import { it } from 'vitest';
import { storageTestSuite } from '@keyv/test-suite';
import KeyvStore from './';

const store = () => new KeyvStore();
storageTestSuite(it, store, { ttlGranularity: 'seconds' });
```

Use `ttl: false` only when the adapter has no storage-level TTL support at all.

## Testing Compression Adapters

If you're testing a compression adapter, you can use the `keyvCompressionTests` method instead of `keyvTestSuite`.

```js
import test from 'vitest';
import { keyvCompressionTests, KeyvGzip } from '@keyv/test-suite';
import Keyv from 'keyv';

keyvCompressionTests(test, new KeyvGzip());
```

## License

[MIT © Jared Wray](LISCENCE)
