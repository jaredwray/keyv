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

// A random secret, such as the output of `openssl rand -base64 32` (see options.key)
const encryption = new KeyvEncryptNode({ key: process.env.KEYV_SECRET });
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

The encryption key. A string key is hashed once with SHA-256, with no salt or key stretching, and truncated to the length the algorithm needs. That's safe for a random secret but not for a password or passphrase: anyone who reads one stored value can test guesses offline at full speed. Use a random secret, such as the output of `openssl rand -base64 32`, and keep it out of source control. Buffer keys are used directly and must match the expected key length. To use a password or passphrase, derive the key with PBKDF2 first; see [Using a password or passphrase](#using-a-password-or-passphrase).

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

## Using a password or passphrase

If the key has to come from something a person chooses, derive the key bytes with PBKDF2 and pass those instead of the string. PBKDF2 repeats the hash many times, so every guess costs an attacker the same work:

```javascript
import { pbkdf2Sync } from 'node:crypto';
import KeyvEncryptNode from '@keyv/encrypt-node';

// Derive the key once at startup: 600,000 iterations of PBKDF2-HMAC-SHA256 take on the order of 100 ms.
// The salt is a random value you generate once (`openssl rand -base64 16`) and keep with your
// configuration. It isn't secret, but reading values back needs the same passphrase and salt.
const key = pbkdf2Sync(process.env.KEYV_PASSPHRASE, process.env.KEYV_SALT, 600_000, 32, 'sha256');
const encryption = new KeyvEncryptNode({ key });
```

The key length must match the algorithm: 32 bytes for `aes-256-gcm`, `aes-256-ccm`, and `chacha20-poly1305`, 24 for the `aes-192` algorithms, and 16 for the `aes-128` ones.

## License

[MIT © Jared Wray](LICENSE)
