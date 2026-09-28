# @keyv/compress-brotli [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

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

`@keyv/compress-brotli` uses Node's built-in [`node:zlib`](https://nodejs.org/api/zlib.html) Brotli functions. Both options are optional:

- `compressOptions` - [`BrotliOptions`](https://nodejs.org/api/zlib.html#class-brotlioptions) passed to `zlib.brotliCompress`.
- `decompressOptions` - `BrotliOptions` passed to `zlib.brotliDecompress`.

```javascript
import { constants } from 'node:zlib';

const brotli = new KeyvBrotli({
  compressOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } },
});
```

## Migrating to v6

- `KeyvBrotli` implements the v6 `KeyvCompressionAdapter` interface: `compress(value: string): Promise<string>` and `decompress(value: string): Promise<string>`. Keyv passes it the whole serialized entry, and `compress` returns a base64 string.
- The v5 `serialize` and `deserialize` methods and the per-call `options` argument of `compress` and `decompress` were removed. Pass options to the constructor instead.
- The [`compress-brotli`](https://github.com/Kikobeats/compress-brotli) dependency was dropped in favor of `node:zlib`. The only options are `compressOptions` and `decompressOptions`; the old `enable`, `serialize`, `deserialize` and `iltorb` options are gone.
- Values that Keyv v5 wrote with `@keyv/compress-brotli` can't be read by v6. v5 compressed only the `value` field inside the JSON envelope, so reading an old entry fails with a decompression error. Keyv emits `error`, and `get` returns `undefined` when an `error` listener is attached or rejects when none is. Treat a compressed store as a cache that v6 repopulates, or read the old entries with v5 and write them again with v6. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#compression-adapter-interface-change).
- Compression needs serialization, which is on by default. With `serialization: false`, Keyv stores values without compressing them.

## License

[MIT © Jared Wray](LICENSE)