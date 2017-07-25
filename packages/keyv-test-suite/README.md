# keyv-test-suite

> Test suite for Keyv API compliancy

[![Build Status](https://travis-ci.org/lukechilds/keyv-test-suite.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-test-suite)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-test-suite/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-test-suite?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-test-suite.svg)](https://www.npmjs.com/package/keyv-test-suite)

Complete [AVA](https://github.com/avajs/ava) test suite to test a [Keyv](https://github.com/lukechilds/keyv) storage adapter for API compliancy.

## Usage

### Install

Install AVA, Keyv and `keyv-test-suite` as development dependencies.

```shell
npm install --save-dev ava keyv keyv-test-suite
```

Then update `keyv` and `keyv-test-suite` versions to `*` in `package.json` to ensure you're always testing against the latest version.

### Create Test File

`test.js`

```js
import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvStore from './';

const store = new KeyvStore();
keyvTestSuite(test, Keyv, store);
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

## Example

Take a look at [keyv-redis](https://github.com/lukechilds/keyv-redis) for an example of an existing storage adapter using `keyv-test-suite`.

## License

MIT © Luke Childs
