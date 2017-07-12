# keyv-api-tests

> Test suite for Keyv API compliancy

[![Build Status](https://travis-ci.org/lukechilds/keyv-api-tests.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-api-tests)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-api-tests/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-api-tests?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-api-tests.svg)](https://www.npmjs.com/package/keyv-api-tests)

Complete AVA test suite to test a Keyv storage adapter for API compliancy.

## Usage

### Install

Install AVA, `keyv` and `keyv-api-tests`

```shell
npm install --save-dev ava keyv keyv-api-tests
```

Then update `keyv` and `keyv-api-tests` versions to `*` in `package.json` to ensure you're always testing against the latest version.

### Create Test File

`test.js`

```js
import test from 'ava';
import keyvApiTests from 'keyv-api-tests';
import Keyv from 'keyv';
import KeyvStore from './';

const store = new KeyvStore();
keyvApiTests(test, Keyv, store);
```

Where `KeyvStore` is your storage adapter.

Set your test script in `package.json` to `ava`.
```json
"scripts": {
  "test": "ava"
}
```

### Test on all supported Node.js versions

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

## License

MIT © Luke Childs
