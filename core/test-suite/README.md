# @keyv/test-suite [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

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

## Testing Compression Adapters

If you're testing a compression adapter, you can use the `keyvCompresstionTests` method instead of `keyvTestSuite`.

```js
import test from 'vitest';
import { keyvCompresstionTests, KeyvGzip } from '@keyv/test-suite';
import Keyv from 'keyv';

keyvCompresstionTests(test, new KeyvGzip());
```

## License

[MIT © Jared Wray](LISCENCE)
