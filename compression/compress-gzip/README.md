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

Options are [pako](https://github.com/nodeca/pako#readme) v3 options, such as `level`, `windowBits` or `dictionary`. The same object is passed to pako's `deflate` in `compress` and to its `inflate` in `decompress`.

```javascript
const keyv = new Keyv({ compression: new KeyvGzip({ level: 9 }) });
```

## Migrating to v6

- `KeyvGzip` implements the v6 `KeyvCompressionAdapter` interface: `compress(value: string): Promise<string>` and `decompress(value: string): Promise<string>`. Keyv passes it the whole serialized entry, and `compress` returns a base64 string.
- The v5 `serialize` and `deserialize` methods, the public `opts` property and the per-call `options` argument of `compress` and `decompress` were removed. Pass options to the constructor instead.
- pako was upgraded from v2 to v3. The v2 `to: 'string'` option is no longer used; `decompress` always returns a string.
- Values that Keyv v5 wrote with `@keyv/compress-gzip` can't be read by v6. v5 compressed only the `value` field inside the JSON envelope, so reading an old entry fails with `incorrect header check`. Keyv emits `error`, and `get` returns `undefined` when an `error` listener is attached or rejects when none is. Treat a compressed store as a cache that v6 repopulates, or read the old entries with v5 and write them again with v6. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#compression-adapter-interface-change).
- Compression needs serialization, which is on by default. With `serialization: false`, Keyv stores values without compressing them.

## License

[MIT © Jared Wray](LICENSE)