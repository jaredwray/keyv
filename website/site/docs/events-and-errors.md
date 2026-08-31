---
title: Events and Errors
order: 5
description: Error events, telemetry events, symbols, throwOnErrors, and unhandled error behavior.
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
| `STAT_HIT` | `'stat:hit'` | Successful `get` / `has` hit |
| `STAT_MISS` | `'stat:miss'` | Missing or expired key |
| `STAT_SET` | `'stat:set'` | Successful set |
| `STAT_DELETE` | `'stat:delete'` | Delete attempted |
| `STAT_ERROR` | `'stat:error'` | Operation failed |

`clear` and `disconnect` are also emitted (as those method names) when those methods complete.

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

`JSON.stringify` cannot represent `symbol`. If you `set` a symbol, Keyv does **not** throw into your `await`. It emits `'error'` with the string `"symbol cannot be serialized"`, records `stat:error`, and returns `false`.

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

When you assign a store, Keyv subscribes to the adapter's `'error'` event and re-emits it on the Keyv instance. Connection failures from Redis, Postgres, and others surface as `keyv.on('error', ...)`.

If the provided store is not a Map-like, async Map, or storage adapter, Keyv emits:

```
Could not use the provided storage adapter, falling back to KeyvMemoryAdapter with Map
```

and continues with an in-memory Map.

Encode/decode failures also emit `'error'` (for example a corrupt compressed payload). `decode` returns `undefined` after emitting.

## `throwOnErrors` and empty listeners

Hookified's `throwOnEmptyListeners` is **on** by default. An `'error'` event with **no** listeners throws — the standard Node.js `EventEmitter` behavior. Register a listener (even a no-op) if you want to swallow errors:

```js
keyv.on("error", () => {});
```

`throwOnErrors` (`throwOnEmitError`) defaults to `false`. When you set it to `true`, errors still throw only when there is **no** `'error'` listener. With a listener attached, the listener handles the error and nothing is thrown.

```js
const keyv = new Keyv({ throwOnErrors: true });

// throws if the store fails — no listener
await keyv.get("key");

keyv.on("error", (error) => console.error(error));
await keyv.get("key"); // listener runs instead of throwing
```

## Adapter-level throw options

Some adapters have their own flags (for example `@keyv/redis` `throwOnConnectErrors`). Combine them with Keyv's `throwOnErrors` when you want connection failures to be exceptions rather than events.
