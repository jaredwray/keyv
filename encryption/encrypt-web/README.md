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

// Placeholder: use a random secret, such as the output of `openssl rand -base64 32` (see options.key),
// loaded from your runtime's secrets (an environment variable, a Workers secret) rather than written here.
const secret = 'replace-with-a-random-secret';
const encryption = new KeyvEncryptWeb({ key: secret });
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

The encryption key. A string key is hashed once with SHA-256, with no salt or key stretching, and truncated to the length the algorithm needs. That's safe for a random secret but not for a password or passphrase: anyone who reads one stored value can test guesses offline at full speed. Use a random secret, such as the output of `openssl rand -base64 32`, and keep it out of source control. Uint8Array keys are used directly and must match the expected key length. To use a password or passphrase, derive the key with PBKDF2 first; see [Using a password or passphrase](#using-a-password-or-passphrase).

#### options.algorithm

Type: `WebAlgorithm`\
Default: `'aes-256-gcm'`

The cipher algorithm to use. Supported values, all AES-GCM, which is authenticated (AEAD):

- `aes-256-gcm`, `aes-192-gcm`, `aes-128-gcm`

Any other algorithm throws when the adapter is created.

## Using a password or passphrase

If the key has to come from something a person chooses, derive the key bytes with PBKDF2 and pass those instead of the string. PBKDF2 repeats the hash many times, so every guess costs an attacker the same work:

```javascript
import KeyvEncryptWeb from '@keyv/encrypt-web';

// Placeholders: load the passphrase from your runtime's secrets. The salt is a random value you
// generate once (`openssl rand -base64 16`) and keep with your configuration. It isn't secret, but
// reading values back needs the same passphrase and salt.
const passphrase = 'replace-with-your-passphrase';
const salt = 'replace-with-your-salt';

// Derive the key once at startup: 600,000 iterations of PBKDF2-HMAC-SHA256 take on the order of 100 ms.
const encoder = new TextEncoder();
const passphraseKey = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 600_000 },
  passphraseKey,
  256,
);
const encryption = new KeyvEncryptWeb({ key: new Uint8Array(bits) });
```

Derive 256 bits for `aes-256-gcm`, 192 for `aes-192-gcm`, and 128 for `aes-128-gcm`.

## License

[MIT © Jared Wray](LICENSE)
