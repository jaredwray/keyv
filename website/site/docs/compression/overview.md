---
title: Compression
sidebarTitle: Overview
parent: Compression
order: 1
description: Gzip, Brotli, and LZ4 compression adapters for Keyv.
---

# Compression

Compression runs on the **serialized string**, after JSON/SuperJSON/msgpackr and before optional encryption.

```js
import Keyv from "keyv";
import KeyvGzip from "@keyv/compress-gzip";

const keyv = new Keyv({ compression: new KeyvGzip() });
```

## Official adapters

| Package | Algorithm |
| --- | --- |
| [@keyv/compress-gzip](/docs/compression/compress-gzip/) | Gzip (pako) |
| [@keyv/compress-brotli](/docs/compression/compress-brotli/) | Brotli |
| [@keyv/compress-lz4](/docs/compression/compress-lz4/) | LZ4 |

Pick gzip for portability, brotli for smaller payloads at higher CPU, lz4 when you want faster (de)compress.

## Custom adapter

```ts
interface KeyvCompressionAdapter {
	compress(value: string): Promise<string>;
	decompress(value: string): Promise<string>;
}
```

Test with `@keyv/test-suite`:

```js
import { keyvCompressionTests } from "@keyv/test-suite";
import KeyvGzip from "@keyv/compress-gzip";

keyvCompressionTests(test, new KeyvGzip());
```

Serialization must stay enabled (the default). Disabling serialization bypasses compression regardless of the original value type.
