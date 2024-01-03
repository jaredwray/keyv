---
title: 'Test Suite'
permalink: /docs/test-suite/
order: 4
---

# @keyv/test-suite 

> Test suite for Keyv API compliance

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/test-suite.svg)](https://www.npmjs.com/package/@keyv/test-suite)
[![npm](https://img.shields.io/npm/dm/@keyv/test-suite)](https://npmjs.com/package/@keyv/test-suite)

Complete [AVA](https://github.com/avajs/ava) test suite to test a [Keyv](https://github.com/jaredwray/keyv) storage adapter for API compliance.

## Usage

### Install

Install AVA, Keyv and `@keyv/test-suite` as development dependencies.

```shell
npm install --save-dev ava keyv @keyv/test-suite
```

Then update `keyv` and `@keyv/test-suite` versions to `*` in `package.json` to ensure you're always testing against the latest version.

### Create Test File

`test.js`

```js
import test from 'ava';
import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvStore from './';

const store = () => new KeyvStore();
keyvTestSuite(test, Keyv, store);
```

Where `KeyvStore` is your storage adapter.

Set your test script in `package.json` to `ava`.
```json
"scripts": {
  "test": "ava"
}
```

## Example for Storage Adapters

Take a look at [keyv-redis](https://github.com/jaredwray/keyv-redis) for an example of an existing storage adapter using `@keyv/test-suite`.

## Testing Compression Adapters

If you're testing a compression adapter, you can use the `keyvCompresstionTests` method instead of `keyvTestSuite`.

```js
const {keyvCompresstionTests} = require('@keyv/test-suite');
const KeyvGzip = require('@keyv/compress-gzip');

keyvCompresstionTests(test, new KeyvGzip());
```

## License

MIT © Jared Wray
