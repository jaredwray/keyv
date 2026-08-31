---
title: Serialization
sidebarTitle: Overview
parent: Serialization
order: 1
description: Built-in JSON serializer plus SuperJSON and MessagePack packages.
---

# Serialization

Keyv serializes the `{ value, expires? }` envelope before it reaches the store (unless you turn serialization off). That is the first step of the [encode pipeline](/docs/encode-and-decode/).

## Built-in: `KeyvJsonSerializer`

Default. No extra package. Handles JSON types plus `Buffer` / `Uint8Array` and `BigInt`.

```js
import Keyv, { jsonSerializer } from "keyv";

const keyv = new Keyv(); // already using it
keyv.serialization = jsonSerializer;
```

## Official packages

| Package | Format | Extra types |
| --- | --- | --- |
| (built-in) | JSON | `Buffer`, `BigInt` |
| [@keyv/serialize-superjson](/docs/serialization/superjson/) | SuperJSON | `Date`, `Map`, `Set`, `RegExp`, `URL`, `Error`, `undefined` |
| [@keyv/serialize-msgpackr](/docs/serialization/msgpackr/) | MessagePack (base64) | `Date`, `Map`, `Set`, `RegExp`, `Error`, `NaN`, `Infinity` |

```js
import { superJsonSerializer } from "@keyv/serialize-superjson";

const keyv = new Keyv({ serialization: superJsonSerializer });
await keyv.set("when", new Date());
(await keyv.get("when")) instanceof Date; // true
```

## Custom and off

Implement `{ stringify, parse }` or pass `serialization: false` for raw in-memory objects. Compression and encryption need a serializer.

See [Encode and Decode](/docs/encode-and-decode/) for the full pipeline and the adapter interface.
