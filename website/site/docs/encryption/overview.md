---
title: Encryption
sidebarTitle: Overview
parent: Encryption
order: 1
description: Encrypt values at rest with Node.js crypto or the Web Crypto API.
---

# Encryption

Encryption runs last on write (after serialize and optional compress) and first on read. It requires a serializer — the built-in JSON serializer is enough.

```js
import Keyv from "keyv";
import KeyvEncryptNode from "@keyv/encrypt-node";

const keyv = new Keyv({
	encryption: new KeyvEncryptNode({ key: process.env.KEYV_SECRET }),
});

await keyv.set("secret", { token: "…" });
await keyv.get("secret"); // decrypted automatically
```

## Official adapters

| Package | Runtime | Default cipher |
| --- | --- | --- |
| [@keyv/encrypt-node](/docs/encryption/encrypt-node/) | Node.js `crypto` | AES-256-GCM (AES-CCM, ChaCha20-Poly1305, AES-CBC, …) |
| [@keyv/encrypt-web](/docs/encryption/encrypt-web/) | Web Crypto (`crypto.subtle`) | AES-256-GCM (AES-CBC) |

AES-GCM and AES-CBC payloads are **cross-compatible** between the two packages when the key and algorithm match:

- AES-GCM: `base64(IV 12 || AuthTag 16 || Ciphertext)`
- AES-CBC: `base64(IV 16 || Ciphertext)`

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
