---
title: Encode and Decode
order: 8
description: Serialization, compression, and encryption pipeline. Built-in JSON serializer, SuperJSON, MessagePack, and custom adapters.
---

# Encode and Decode

Keyv stores an envelope `{ value, expires? }`, not the raw value. `encode()` turns that envelope into what the adapter persists. `decode()` turns the adapter's bytes back into the envelope.

## Pipeline

**On set:** serialize → compress (optional) → encrypt (optional) → store

**On get:** store → decrypt (optional) → decompress (optional) → parse → value

Compression and encryption operate on the **serialized string**. They only run when a serializer is configured. The built-in `KeyvJsonSerializer` is on by default, so this works out of the box.

If you set `serialization: false`, values go to the store as-is and compression/encryption are skipped.

```js
const packed = await keyv.encode({ value: { n: 1 }, expires: Date.now() + 1000 });
const envelope = await keyv.decode(packed);
// { value: { n: 1 }, expires: ... }
```

`decode` returns `undefined` for `null` / `undefined` input, or if decrypt/decompress/parse throws (the error is emitted as `'error'`).

## Built-in JSON serializer

`KeyvJsonSerializer` is the default. It uses `JSON.stringify` / `JSON.parse` with extra tags:

- `Buffer` / `Uint8Array` → `:base64:...`
- `BigInt` → `:bigint:...`
- Strings that already start with `:` are escaped so they round-trip

In browsers without `Buffer`, it uses `btoa` / `atob`.

```js
import Keyv, { KeyvJsonSerializer, jsonSerializer } from "keyv";

const keyv = new Keyv(); // already using KeyvJsonSerializer
keyv.serialization = jsonSerializer; // shared instance
```

## Official serializers

| Package | Extra types |
| --- | --- |
| built-in `KeyvJsonSerializer` | JSON + `Buffer` + `BigInt` |
| [`@keyv/serialize-superjson`](/docs/serialization/superjson/) | `Date`, `Map`, `Set`, `RegExp`, `URL`, `Error`, `undefined` |
| [`@keyv/serialize-msgpackr`](/docs/serialization/msgpackr/) | `Date`, `Map`, `Set`, `RegExp`, `Error`, `NaN`, `Infinity` (binary) |

```js
import { superJsonSerializer } from "@keyv/serialize-superjson";
import { msgpackrSerializer } from "@keyv/serialize-msgpackr";

const withDates = new Keyv({ serialization: superJsonSerializer });
const compact = new Keyv({ serialization: msgpackrSerializer });
```

## Custom serializer

```ts
interface KeyvSerializationAdapter {
	stringify: (object: unknown) => string | Promise<string>;
	parse: <T>(data: string) => T | Promise<T>;
}
```

```js
const serializer = {
	stringify: (value) => JSON.stringify(value),
	parse: (data) => JSON.parse(data),
};
const keyv = new Keyv({ serialization: serializer });
```

## Disabling serialization

Useful for an in-memory `Map` of objects when you do not need a string payload:

```js
const keyv = new Keyv({ store: new Map(), serialization: false });
```

Do not disable serialization if you use compression, encryption, or a backend that only stores strings.

## Compression and encryption

```js
import KeyvGzip from "@keyv/compress-gzip";
import KeyvEncryptNode from "@keyv/encrypt-node";

const keyv = new Keyv({
	compression: new KeyvGzip(),
	encryption: new KeyvEncryptNode({ key: process.env.KEYV_SECRET }),
});
```

See [Compression](/docs/compression/overview/) and [Encryption](/docs/encryption/overview/).

## `decodeWithExpire`

Internal helper used by `get` / `has` when `checkExpired` is on. It decodes each row and deletes keys whose `expires` is in the past. You can call it if you are reading raw adapter rows yourself.
