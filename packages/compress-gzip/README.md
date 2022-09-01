# @keyv/tiered [<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/lukechilds/keyv)

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
const KeyvGzip = require('@keyv/compress-gzip');
const Keyv = require('keyv');

const keyv = new Keyv({store: new Map(), compression: new KeyvGzip()});

```

## API

### @keyv/compress-gzip(\[options])

#### options

All options for @keyv/compress-gzip are based on the package [compress-gzip](https://github.com/Rebsos/node-gzip#readme)

## License

MIT © Jared Wray