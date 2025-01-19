# @keyv/compress-lz4-napi [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> lz4-napi compression for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/compress-lz4-napi.svg)](https://www.npmjs.com/package/@keyv/compress-lz4-napi)
[![npm](https://img.shields.io/npm/dm/@keyv/compress-lz4-napi)](https://npmjs.com/package/@keyv/compress-lz4-napi)

lz4-napi compression for [Keyv](https://github.com/jaredwray/keyv).

lz4-napi is a data compression algorithm that is designed to be fast and efficient.

## Install

```shell
npm install --save keyv @keyv/compress-lz4-napi
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvLz4Napi from '@keyv/compress-lz4-napi';

const keyv = new Keyv({store: new Map(), compression: new Lz4Napi()});

```

## API

### @keyv/compress-lz4-napi(\[options])

#### options

All options for `@keyv/compress-lz4-napi` are based on the package [lz4-napi](https://github.com/antoniomuso/lz4-napi)

## License

[MIT © Jared Wray](LICENSE)