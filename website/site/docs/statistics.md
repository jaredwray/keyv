---
title: Statistics
order: 11
description: Enable KeyvStats for hits, misses, sets, deletes, errors, and per-key LRU frequency maps.
---

# Statistics

`KeyvStats` listens to [telemetry events](/docs/logging-and-telemetry/) and counts them. Tracking is **off** until you turn it on.

```js
const keyv = new Keyv({ stats: true });

await keyv.set("foo", "bar");
await keyv.get("foo");
await keyv.get("missing");
await keyv.delete("foo");

console.log(keyv.stats.hits); // 1
console.log(keyv.stats.misses); // 1
console.log(keyv.stats.sets); // 1
console.log(keyv.stats.deletes); // 1
```

## Counters

| Property | Meaning |
| --- | --- |
| `hits` | Successful retrievals |
| `misses` | Missing or expired keys |
| `sets` | Successful sets |
| `deletes` | Deletes |
| `errors` | Failed operations |

## Per-key LRU maps

Each event type has a `Map<string, number>` capped at `maxEntries` (default **1000**). Keys are `namespace:key` when a namespace is set, otherwise just `key`.

| Map | Event |
| --- | --- |
| `hitKeys` | `stat:hit` |
| `missKeys` | `stat:miss` |
| `setKeys` | `stat:set` |
| `deleteKeys` | `stat:delete` |
| `errorKeys` | `stat:error` |

```js
console.log(keyv.stats.hitKeys.get("foo")); // 1
console.log(keyv.stats.missKeys.get("missing")); // 1
```

When a map is full, the oldest key is evicted (LRU via insert order).

## Enable, disable, reset

```js
const keyv = new Keyv({ stats: false });
keyv.stats.enabled = true; // subscribe
keyv.stats.enabled = false; // unsubscribe
keyv.stats.reset(); // counters and maps back to empty
keyv.stats.maxEntries = 500;
```

Disabling unsubscribes listeners but keeps the last emitter around so re-enabling works.

## Standalone `KeyvStats`

You can point stats at any Hookified/EventEmitter that emits `stat:*` events:

```js
import { KeyvStats } from "keyv";

const stats = new KeyvStats({ enabled: true, maxEntries: 500, emitter: keyv });
```

If `enabled` is `false` but `emitter` is passed, the emitter is stored and used when you later set `enabled = true`.
