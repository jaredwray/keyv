---
title: Events and Errors
order: 5
description: Error events, when errors throw, telemetry events, and symbols.
---

# Events and Errors

Keyv extends [Hookified](https://hookified.org), which is an `EventEmitter`-compatible event bus. Import the event names from `KeyvEvents` so you do not depend on string literals.

```js
import Keyv, { KeyvEvents } from "keyv";

const keyv = new Keyv();
keyv.on(KeyvEvents.ERROR, (error) => {
	console.error("Keyv error", error);
});
```

## Event names (`KeyvEvents`)

`KeyvEvents` is a **string enum** (`KeyvEvents.ERROR === "error"`). Import the names so you do not depend on magic strings.

| Name | Value | When |
| --- | --- | --- |
| `ERROR` | `'error'` | Store failure, encode/decode failure, invalid store, unserializable value |
| `INFO` | `'info'` | Informational messages (available for your own emits and logger routing) |
| `WARN` | `'warn'` | Warnings, including Hookified deprecation warnings |
| `STAT_HIT` | `'stat:hit'` | Successful `get` / `getRaw` read, including batch variants |
| `STAT_MISS` | `'stat:miss'` | Missing or expired `get` / `getRaw` read, including batch variants |
| `STAT_SET` | `'stat:set'` | Successful set |
| `STAT_DELETE` | `'stat:delete'` | Delete attempted |
| `STAT_ERROR` | `'stat:error'` | Operation failed |

`clear` and `disconnect` are also emitted (as those method names) when those methods begin, before the corresponding hooks and adapter operation run.

```js
keyv.on("clear", () => console.log("namespace cleared"));
keyv.on("disconnect", () => console.log("disconnected"));
```

Telemetry payloads are `KeyvTelemetryEvent` objects:

```ts
type KeyvTelemetryEvent = {
	event: string; // 'hit' | 'miss' | 'set' | 'delete' | 'error'
	key?: string;
	namespace?: string;
	timestamp: number;
};
```

See [Logging & Telemetry](/docs/logging-and-telemetry/) and [Statistics](/docs/statistics/).

## Symbols cannot be serialized

`JSON.stringify` cannot represent `symbol`. If you `set` a symbol, Keyv emits `'error'` with the string `"symbol cannot be serialized"` and records `stat:error`. With a listener attached, `set` then returns `false`. With none, it rejects.

```js
import Keyv, { KeyvEvents } from "keyv";

const keyv = new Keyv();
keyv.on(KeyvEvents.ERROR, (error) => {
	console.error(error); // 'symbol cannot be serialized'
});

const ok = await keyv.set("id", Symbol("id"));
console.log(ok); // false
```

The same check runs inside `setMany`. Prefer strings, numbers, or objects as values.

## Error forwarding from the store

When you assign a store, Keyv subscribes to the adapter's `'error'` event and re-emits it on the Keyv instance. Connection failures from Redis, Postgres, and others surface as `keyv.on('error', ...)`. An adapter can emit these outside any Keyv call, for example when a Redis connection drops. With no listener attached, such an error is thrown with no call to catch it, which can crash the process, so attach a listener whenever your adapter connects to a server.

If the provided store is not a Map-like, async Map, or storage adapter, Keyv emits:

```
Could not use the provided storage adapter, falling back to KeyvMemoryAdapter with Map
```

With a listener attached, Keyv then continues with an in-memory Map. With none, the error is thrown, so passing an unusable store to the constructor throws.

Encode/decode failures also emit `'error'` (for example a corrupt compressed payload). With a listener attached, `decode` returns `undefined` after emitting.

## When errors throw

Keyv follows the Node.js `EventEmitter` rule. When an operation fails, Keyv emits `'error'`, and whether the operation also throws depends on whether a listener is attached:

- **With a listener**, the listener receives the error and the operation returns a fallback value.
- **With no listener**, the operation rejects with the error.

```js
const keyv = new Keyv(store); // any storage adapter

// No listener: a failed call rejects.
await keyv.get("key"); // throws if the store fails

keyv.on("error", (error) => console.error(error));
await keyv.get("key"); // undefined if the store fails, and the listener receives the error
```

These are the fallback values a failed call returns when a listener is attached:

| Method | Returns |
| --- | --- |
| `get`, `getRaw` | `undefined` |
| `getMany`, `getManyRaw` | an array of `undefined` |
| `set`, `setRaw`, `delete`, `has` | `false` |
| `setMany`, `setManyRaw`, `deleteMany`, `hasMany` | an array of `false` |
| `clear`, `disconnect` | `undefined` |
| `iterator` | ends the iteration |

A failed read looks the same as a missing key, so use the `'error'` events when you need to tell them apart. It emits `stat:error`, not `stat:miss`. To discard errors without logging them, register a no-op listener:

```js
keyv.on("error", () => {});
```

Keyv v5's `throwOnErrors` and `emitErrors` options were removed in v6. See the [v5 to v6 migration guide](/docs/migration/v5-to-v6/#error-handling-changed-and-throwonerrors-was-removed).

## Adapter-level throw options

Some adapters have their own flags that control whether the adapter itself rejects or emits `'error'` and returns a fallback value, for example `@keyv/redis` `throwOnConnectError` and `throwOnErrors`. An adapter should do one or the other for a given failure, not both, so Keyv reports the failure once. When the adapter rejects, Keyv handles the failure like any other: it emits `'error'`, then returns a fallback value if a listener is attached or rejects if none is.
