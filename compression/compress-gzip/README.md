# @keyv/compress-gzip [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Gzip compression for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/compress-gzip.svg)](https://www.npmjs.com/package/@keyv/compress-gzip)
[![npm](https://img.shields.io/npm/dm/@keyv/compress-gzip)](https://npmjs.com/package/@keyv/compress-gzip)

Gzip compression for [Keyv](https://github.com/jaredwray/keyv).

## Install

```shell
npm install --save keyv @keyv/compress-gzip
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvGzip from '@keyv/compress-gzip';

const keyv = new Keyv({store: new Map(), compression: new KeyvGzip()});

```

## API

### @keyv/compress-gzip(\[options])

#### options

All options for `@keyv/compress-gzip` are based on the package [compress-gzip](https://github.com/nodeca/pako#readme)

## Upgrading from Keyv v5

Keyv v5 compressed only the value and stored it in a JSON envelope, like `{"value":":base64:…","expires":1700000000000}`. Keyv v6 compresses the whole serialized entry. This adapter recognizes the v5 format and decodes it, so values that Keyv v5 wrote with `@keyv/compress-gzip` v2 stay readable after the upgrade. Create the adapter with the same options you used in v5. Keyv writes a value in the v6 format the next time it is set.

This covers Keyv's default serialization. Values that v5 compressed with custom `serialize` and `deserialize` functions are not recognized. Keyv v6 also needs the namespace v5 used to find those keys. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#the-default-keyv-namespace-was-removed).

## License

[MIT © Jared Wray](LICENSE)