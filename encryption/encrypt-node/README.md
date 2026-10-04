# @keyv/encrypt-node [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Node.js crypto encryption for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/encrypt-node.svg)](https://www.npmjs.com/package/@keyv/encrypt-node)
[![npm](https://img.shields.io/npm/dm/@keyv/encrypt-node)](https://npmjs.com/package/@keyv/encrypt-node)

Encrypt and decrypt values stored in [Keyv](https://github.com/jaredwray/keyv) using the Node.js `crypto` module. Supports the authenticated ciphers AES-GCM (default), AES-CCM, and ChaCha20-Poly1305, so a value changed in the store fails to decrypt instead of decrypting to altered data.

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

Encryption runs on the serialized value, so it needs serialization, which is on by default. With `serialization: false`, Keyv doesn't store values unencrypted: writes fail, Keyv emits `error`, and `set()` returns `false` when a listener is attached or rejects when none is.

## API

### new KeyvEncryptNode(options)

#### options.key

Type: `string | Buffer`\
**Required**

The encryption key. String keys are hashed with SHA-256 and truncated to the required length for the algorithm. Buffer keys are used directly and must match the expected key length.

#### options.algorithm

Type: `NodeAlgorithm`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supported values, all authenticated (AEAD):

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm`
- `aes-256-ccm`, `aes-192-ccm`, `aes-128-ccm`
- `chacha20-poly1305`

Any other algorithm throws when the adapter is created. AES-CCM can't encrypt a serialized value of 16 MiB or more; writing one fails.

#### options.encoding

Type: `NodeEncoding`\
Default: `'base64'`

The encoding used for the encrypted output string: `'base64'`, `'base64url'`, or `'hex'`. Other encodings can't hold arbitrary bytes, so they throw when the adapter is created.

## License

[MIT © Jared Wray](LICENSE)
