# @keyv/test-suite [<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Test suite for Keyv API compliance

[![build](https://github.com/jaredwray/keyv/actions/workflows/build.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/build.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/master/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/test-suite.svg)](https://www.npmjs.com/package/@keyv/test-suite)

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

### Test on Active Node.js LTS and Higher

An example configuration for Travis CI would look like this:

`.travis.yml`

```yaml
language: node_js
node_js:
  - '8'
  - '6'
  - '4'
script: npm test
```

## Example

Take a look at [keyv-redis](https://github.com/jaredwray/keyv-redis) for an example of an existing storage adapter using `@keyv/test-suite`.

## License

MIT © Jared Wray & Luke Childs
