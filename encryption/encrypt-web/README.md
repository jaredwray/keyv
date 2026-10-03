# @keyv/encrypt-web [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Web Crypto API encryption for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/encrypt-web.svg)](https://www.npmjs.com/package/@keyv/encrypt-web)
[![npm](https://img.shields.io/npm/dm/@keyv/encrypt-web)](https://npmjs.com/package/@keyv/encrypt-web)

Encrypt and decrypt values stored in [Keyv](https://github.com/jaredwray/keyv) using the Web Crypto API (`crypto.subtle`). Works in browsers, Deno, Cloudflare Workers, and Node.js 18+. No Node.js-specific dependencies.

## Install

```shell
npm install --save keyv @keyv/encrypt-web
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvEncryptWeb from '@keyv/encrypt-web';

const encryption = new KeyvEncryptWeb({ key: 'your-secret-key' });
const keyv = new Keyv({ encryption });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar' (decrypted automatically)
```

Encryption runs on the serialized value, so it needs serialization, which is on by default. With `serialization: false`, Keyv doesn't store values unencrypted: writes fail, Keyv emits `error`, and `set()` returns `false` when a listener is attached or rejects when none is.

## API

### new KeyvEncryptWeb(options)

#### options.key

Type: `string | Uint8Array`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Uint8Array keys are used directly and must match the expected key length.

#### options.algorithm

Type: `WebAlgorithm`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supported values, all AES-GCM, which is authenticated (AEAD):

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm`

Any other algorithm throws when the adapter is created.

## License

[MIT © Jared Wray](LICENSE)
