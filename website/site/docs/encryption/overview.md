---
title: Encryption
sidebarTitle: Overview
parent: Encryption
order: 1
description: Encrypt values at rest with Node.js crypto or the Web Crypto API.
---

# Encryption

Encryption runs last on write (after serialize and optional compress) and first on read. It requires a serializer — the built-in JSON serializer is enough. With `serialization: false`, writes fail with an error instead of storing values unencrypted.

```js
import Keyv from "keyv";
import KeyvEncryptNode from "@keyv/encrypt-node";

const keyv = new Keyv({
	encryption: new KeyvEncryptNode({ key: process.env.KEYV_SECRET }),
});

await keyv.set("secret", { token: "…" });
await keyv.get("secret"); // decrypted automatically
```

Use a random secret as the key, such as the output of `openssl rand -base64 32`, kept out of source control. Both adapters hash a string key once with SHA-256, with no salt or key stretching, so a password or passphrase can be guessed offline from a single stored value. You can also pass the raw key bytes (`Buffer` or `Uint8Array`) at the algorithm's key length. If the key has to come from a password or passphrase, derive those bytes with PBKDF2 first: the [encrypt-node](/docs/encryption/encrypt-node/) and [encrypt-web](/docs/encryption/encrypt-web/) pages show how.

## Official adapters

| Package | Runtime | Default cipher |
| --- | --- | --- |
| [@keyv/encrypt-node](/docs/encryption/encrypt-node/) | Node.js `crypto` | AES-256-GCM (AES-CCM, ChaCha20-Poly1305) |
| [@keyv/encrypt-web](/docs/encryption/encrypt-web/) | Web Crypto (`crypto.subtle`) | AES-256-GCM (AES-128-GCM, AES-192-GCM) |

Use encrypt-web in browsers, Deno, and Cloudflare Workers. Use encrypt-node when you want Node-only ciphers.

## Custom adapter

```ts
interface KeyvEncryptionAdapter {
	encrypt: (data: string) => string | Promise<string>;
	decrypt: (data: string) => string | Promise<string>;
}
```

```js
const encryption = {
	encrypt: async (data) => Buffer.from(data).toString("base64"),
	decrypt: async (data) => Buffer.from(data, "base64").toString("utf8"),
};
const keyv = new Keyv({ encryption });
```

Detect adapters with `detectKeyvEncryption`. See [Encode and Decode](/docs/encode-and-decode/) and [Detect Capabilities](/docs/detect-capabilities/).
