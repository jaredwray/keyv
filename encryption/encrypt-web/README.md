# @keyv/encrypt-browser [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Web Crypto API encryption for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/encrypt-browser.svg)](https://www.npmjs.com/package/@keyv/encrypt-browser)
[![npm](https://img.shields.io/npm/dm/@keyv/encrypt-browser)](https://npmjs.com/package/@keyv/encrypt-browser)

Encrypt and decrypt values stored in [Keyv](https://github.com/jaredwray/keyv) using the Web Crypto API (`crypto.subtle`). Works in browsers, Deno, Cloudflare Workers, and Node.js 18+. No Node.js-specific dependencies.

## Install

```shell
npm install --save keyv @keyv/encrypt-browser
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvEncryptBrowser from '@keyv/encrypt-browser';

const encryption = new KeyvEncryptBrowser({ key: 'your-secret-key' });
const keyv = new Keyv({ encryption });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar' (decrypted automatically)
```

## API

### new KeyvEncryptBrowser(options)

#### options.key

Type: `string | Uint8Array`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Uint8Array keys are used directly and must match the expected key length.

#### options.algorithm

Type: `BrowserAlgorithm`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supported values:

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm` (AEAD, recommended)
- `aes-256-cbc`, `aes-192-cbc`, `aes-128-cbc`

## Cross-Compatibility

Data encrypted with `@keyv/encrypt-browser` using AES-GCM or AES-CBC can be decrypted by `@keyv/encrypt-node` (and vice versa) when using the same key and algorithm. Both packages use the same wire format:

- **AES-GCM**: `base64([IV (12 bytes) || AuthTag (16 bytes) || Ciphertext])`
- **AES-CBC**: `base64([IV (16 bytes) || Ciphertext])`

## License

[MIT © Jared Wray](LICENSE)
