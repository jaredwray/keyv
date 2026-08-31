---
title: Properties
order: 3
description: Instance properties on Keyv — store, namespace, TTL, serialization, compression, encryption, stats, sanitize, and more.
---

# Properties

Every constructor option is also a live property. Changing a property updates the running instance (and, for `namespace`, the storage adapter).

## `.store`

Type: `KeyvStorageAdapter`  
Default: `KeyvMemoryAdapter` wrapping a `Map`

Get or replace the storage adapter. Setting it resolves Map-like and legacy stores, forwards `'error'` events, and applies the current namespace.

```js
import KeyvSqlite from "@keyv/sqlite";

const keyv = new Keyv();
keyv.store = new KeyvSqlite("sqlite://./cache.sqlite");
```

## `.namespace`

Type: `string | undefined`  
Default: `undefined`

When set, Keyv sanitizes it (if sanitization is on) and writes it to `store.namespace`. Setting `undefined` stops namespacing. See [Namespaces](/docs/namespaces/).

```js
const keyv = new Keyv({ namespace: "users" });
console.log(keyv.namespace); // 'users'
keyv.namespace = undefined;
```

## `.ttl`

Type: `number | undefined`  
Default: `undefined`

Default TTL in milliseconds. `0` and negative values become `undefined` (never expires). Override per call with `set(key, value, ttl)`.

```js
const keyv = new Keyv({ ttl: 5000 });
keyv.ttl = undefined;
```

## `.serialization`

Type: `KeyvSerializationAdapter | undefined`

`false` in the constructor becomes `undefined` on the property (serialization off). See [Encode and Decode](/docs/encode-and-decode/).

```js
const keyv = new Keyv();
keyv.serialization; // KeyvJsonSerializer
keyv.serialization = false; // disable
```

## `.compression`

Type: `KeyvCompressionAdapter | undefined`  
Default: `undefined`

```js
import KeyvGzip from "@keyv/compress-gzip";

const keyv = new Keyv();
keyv.compression = new KeyvGzip();
```

## `.encryption`

Type: `KeyvEncryptionAdapter | undefined`  
Default: `undefined`

```js
keyv.encryption = {
	encrypt: async (data) => Buffer.from(data).toString("base64"),
	decrypt: async (data) => Buffer.from(data, "base64").toString("utf8"),
};
```

## `.checkExpired`

Type: `boolean`  
Default: `true`

Read-only after construction. Configured only via the `checkExpired` option. See [Options](/docs/options/#checkexpired).

```js
const keyv = new Keyv();
keyv.checkExpired; // true

const trusting = new Keyv({ checkExpired: false });
trusting.checkExpired; // false
```

## `.throwOnErrors`

Type: `boolean`  
Default: `false`

Alias of Hookified's `throwOnEmitError`. See [Events and Errors](/docs/events-and-errors/).

```js
const keyv = new Keyv({ throwOnErrors: true });
keyv.throwOnErrors = false;
```

## `.stats`

Type: `KeyvStats`

Always present. Tracking is off until you pass `{ stats: true }` or set `keyv.stats.enabled = true`. See [Statistics](/docs/statistics/).

```js
const keyv = new Keyv({ stats: true });
keyv.stats.hits;
keyv.stats.reset();
```

## `.sanitize`

Type: `KeyvSanitize`

Always present. Disabled until you pass the `sanitize` option. Update it with `updateOptions()` or replace the adapter. See [Sanitization](/docs/sanitization/).

```js
import { KeyvSanitize } from "keyv";

keyv.sanitize.updateOptions({ keys: true, namespace: true });
keyv.sanitize = new KeyvSanitize({ keys: true, namespace: false });
```

## Inherited from Hookified

Keyv extends [Hookified](https://hookified.org), so these are also available:

| Property | Purpose |
| --- | --- |
| `hooks` | `Map` of registered hook handlers |
| `eventLogger` | Optional Pino/Winston-style logger; see [Logging & Telemetry](/docs/logging-and-telemetry/) |
| `throwOnHookError` | Throw when a hook throws (default `false`) |
| `throwOnEmptyListeners` | Throw on `'error'` with no listeners (default `true`) |
