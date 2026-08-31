---
title: Logging & Telemetry
order: 12
description: stat:* telemetry events, eventLogger (Pino/Winston), and how stats subscribe to the same events.
---

# Logging & Telemetry

Keyv emits structured telemetry on every cache operation and can pipe events through Hookified's `eventLogger` (Pino, Winston, or any logger with `info` / `warn` / `error` / …).

## Telemetry events

Emitted as `KeyvEvents` (see [Events and Errors](/docs/events-and-errors/)):

| Event | Payload |
| --- | --- |
| `stat:hit` | `{ event: 'hit', key, namespace, timestamp }` |
| `stat:miss` | `{ event: 'miss', key, namespace, timestamp }` |
| `stat:set` | `{ event: 'set', key, namespace, timestamp }` |
| `stat:delete` | `{ event: 'delete', key, namespace, timestamp }` |
| `stat:error` | `{ event: 'error', key, namespace, timestamp }` |

Batch methods emit **one event per key**.

```js
import Keyv, { KeyvEvents } from "keyv";

const keyv = new Keyv();

keyv.on(KeyvEvents.STAT_HIT, (event) => {
	console.log("hit", event.key, event.namespace, event.timestamp);
});
```

`KeyvStats` is a ready-made subscriber for these events. See [Statistics](/docs/statistics/).

## `eventLogger`

Keyv extends Hookified, so you can attach a logger. Hookified maps event names to log levels:

| Emitted name | Logger method |
| --- | --- |
| `error` | `error()` |
| `warn` | `warn()` |
| `debug` | `debug()` |
| `trace` | `trace()` |
| `fatal` | `fatal()` |
| anything else (including `stat:hit`) | `info()` |

```js
import pino from "pino";

const keyv = new Keyv();
keyv.eventLogger = pino({ level: "info" });

keyv.on("error", () => {}); // keep empty-listener throws from firing
await keyv.set("foo", "bar");
```

The constructor does not take `eventLogger`; set the property after `new Keyv()`.

Remove it with `keyv.eventLogger = undefined`.

## Custom metrics

Subscribe to `stat:*` yourself to export Prometheus counters, OpenTelemetry spans, or logs without enabling `KeyvStats`:

```js
keyv.on("stat:hit", ({ key, namespace }) => {
	metrics.increment("cache_hit", { key, namespace });
});
keyv.on("stat:miss", ({ key }) => {
	metrics.increment("cache_miss", { key });
});
```

## Deprecation warnings

Using v5 hook names (`preSet`, …) emits `'warn'` and, if configured, `eventLogger.warn()`. Prefer `KeyvHooks.BEFORE_*` / `AFTER_*`. See [Hooks](/docs/hooks/).
