# @keyv/compress-lz4 [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> lz4-napi compression for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/compress-lz4.svg)](https://www.npmjs.com/package/@keyv/compress-lz4)
[![npm](https://img.shields.io/npm/dm/@keyv/compress-lz4)](https://npmjs.com/package/@keyv/compress-lz4)

lz4-napi compression for [Keyv](https://github.com/jaredwray/keyv).

lz4-napi is a data compression algorithm that is designed to be fast and efficient.

## Install

```shell
npm install --save keyv @keyv/compress-lz4
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvLz4 from '@keyv/compress-lz4';

const keyv = new Keyv({store: new Map(), compression: new KeyvLz4()});

```

## API

### @keyv/compress-lz4(\[options])

#### options

All options for `@keyv/compress-lz4` are based on the package [lz4-napi](https://github.com/antoniomuso/lz4-napi)

## License

[MIT © Jared Wray](LICENSE)