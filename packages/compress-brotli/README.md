# @keyv/compress-brotli [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Brotli compression for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/compress-brotli.svg)](https://www.npmjs.com/package/@keyv/compress-brotli)
[![npm](https://img.shields.io/npm/dm/@keyv/compress-brotli)](https://npmjs.com/package/@keyv/compress-brotli)

Brotli compression for [Keyv](https://github.com/jaredwray/keyv).

Brotli is a data compression algorithm that is designed to be fast and efficient.

## Install

```shell
npm install --save keyv @keyv/compress-brotli
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvBrotli from '@keyv/compress-brotli';

const keyv = new Keyv({store: new Map(), compression: new KeyvBrotli()});

```

## API

### @keyv/compress-brotli(\[options])

#### options

All options for `@keyv/compress-brotli` are based on the package [compress-brotli](https://github.com/Kikobeats/compress-brotli)

## License

[MIT © Jared Wray](LICENSE)