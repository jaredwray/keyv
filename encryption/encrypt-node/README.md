# @keyv/encrypt-node [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Node.js crypto encryption for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/encrypt-node.svg)](https://www.npmjs.com/package/@keyv/encrypt-node)
[![npm](https://img.shields.io/npm/dm/@keyv/encrypt-node)](https://npmjs.com/package/@keyv/encrypt-node)

Encrypt and decrypt values stored in [Keyv](https://github.com/jaredwray/keyv) using the Node.js `crypto` module. Supports AES-GCM (default), AES-CCM, ChaCha20-Poly1305, AES-CBC, and any cipher available in your Node.js installation.

## Install

```shell
npm install --save keyv @keyv/encrypt-node
```

## Usage

```javascript
import Keyv from 'keyv';
import KeyvEncryptNode from '@keyv/encrypt-node';

const encryption = new KeyvEncryptNode({ key: 'your-secret-key' });
const keyv = new Keyv({ encryption });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar' (decrypted automatically)
```

## API

### new KeyvEncryptNode(options)

#### options.key

Type: `string | Buffer`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Buffer keys are used directly and must match the expected key length.

#### options.algorithm

Type: `string`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supports any algorithm available via Node.js `crypto.getCipherInfo()`, including:

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm` (AEAD)
- `aes-256-ccm`, `aes-192-ccm`, `aes-128-ccm` (AEAD)
- `chacha20-poly1305` (AEAD)
- `aes-256-cbc`, `aes-192-cbc`, `aes-128-cbc`

#### options.encoding

Type: `BufferEncoding`\
Default: `'base64'`

The encoding used for the encrypted output string. Common options: `'base64'`, `'hex'`.

## Cross-Compatibility

Data encrypted with `@keyv/encrypt-node` using AES-GCM or AES-CBC can be decrypted by `@keyv/encrypt-web` (and vice versa) when using the same key and algorithm. Both packages use the same wire format:

- **AES-GCM**: `base64([IV (12 bytes) || AuthTag (16 bytes) || Ciphertext])`
- **AES-CBC**: `base64([IV (16 bytes) || Ciphertext])`

## License

[MIT © Jared Wray](LICENSE)
