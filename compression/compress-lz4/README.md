# @keyv/compress-lz4 [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> lz4 compression for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/compress-lz4.svg)](https://www.npmjs.com/package/@keyv/compress-lz4)
[![npm](https://img.shields.io/npm/dm/@keyv/compress-lz4)](https://npmjs.com/package/@keyv/compress-lz4)

lz4 compression for [Keyv](https://github.com/jaredwray/keyv).

`lz4` is a data compression algorithm that is designed to be fast and efficient and is provided by the package [lz4-napi](https://npmjs.com/package/lz4-napi).

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

### @keyv/compress-lz4(\[dictionary])

#### dictionary

An optional string that [lz4-napi](https://npmjs.com/package/lz4-napi) uses as the dictionary for both compression and decompression. Use the same dictionary to read values that were written with it.

```javascript
const keyv = new Keyv({ compression: new KeyvLz4('my-dictionary') });
```

## Migrating to v6

- `KeyvLz4` implements the v6 `KeyvCompressionAdapter` interface: `compress(value: string): Promise<string>` and `decompress(value: string): Promise<string>`. Keyv passes it the whole serialized entry, and `compress` returns a base64 string instead of a `Uint8Array`.
- The v5 `serialize` and `deserialize` methods were removed. The constructor still takes an optional dictionary string.
- Values that Keyv v5 wrote with `@keyv/compress-lz4` can't be read by v6. v5 compressed only the `value` field inside the JSON envelope, so an old entry doesn't decode. Keyv emits `error`, and `get` returns `undefined` when an `error` listener is attached or rejects when none is. Treat a compressed store as a cache that v6 repopulates, or read the old entries with v5 and write them again with v6. See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#compression-adapter-interface-change).
- Compression needs serialization, which is on by default. With `serialization: false`, Keyv stores values without compressing them.

## License

[MIT © Jared Wray](LICENSE)