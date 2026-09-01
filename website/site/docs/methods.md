---
title: Methods
order: 4
description: Keyv methods — set, get, delete, has, batch APIs, raw access, iterator, disconnect, encode, and decode.
---

# Methods

Keys are always strings. Values can be any type the serializer can handle. Every mutating and reading method is async.

## `.set(key, value, [ttl])`

Set a value. Optional `ttl` is relative milliseconds and overrides the instance default. Returns `true` on success, `false` if the key is empty after sanitization, the value is a `symbol`, or the store throws.

```js
await keyv.set("foo", "bar");
await keyv.set("foo", "expires", 1000);
```

> [!WARNING]
> `symbol` values cannot be serialized. Keyv emits `'error'` with `"symbol cannot be serialized"` and returns `false`. See [Events and Errors](/docs/events-and-errors/).

## `.setMany(entries)`

Set many values. Each entry is a `KeyvEntry`: `{ key, value, ttl? }`. Returns `boolean[]`.

```js
await keyv.setMany([
	{ key: "a", value: 1, ttl: 1000 },
	{ key: "b", value: 2 },
]);
```

## `.get(key)`

Returns the value, or `undefined` if missing or expired. Passing an array of keys delegates to `.getMany()`.

```js
await keyv.get("foo"); // 'bar' | undefined
await keyv.get(["a", "b"]); // same as getMany
```

## `.getMany(keys)`

Returns `(Value | undefined)[]` in the same order as `keys`.

```js
await keyv.getMany(["a", "missing"]); // [1, undefined]
```

## `.getRaw(key)` / `.getManyRaw(keys)`

Return the stored envelope `{ value, expires? }` instead of unwrapping `.value`. Use this when you need the expiry timestamp or round-trip through `.setRaw()`.

```js
await keyv.set("foo", "bar", 60_000);
const raw = await keyv.getRaw("foo");
// { value: 'bar', expires: 1710000000000 }
```

## `.setRaw(key, value)` / `.setManyRaw(entries)`

Write a `KeyvValue` envelope yourself. The envelope is still encoded (serialize → compress → encrypt). Derive TTL from `value.expires` (absolute Unix ms).

```js
await keyv.setRaw("foo", { value: "bar", expires: Date.now() + 60_000 });

await keyv.setManyRaw([
	{ key: "a", value: { value: 1 } },
	{ key: "b", value: { value: 2, expires: Date.now() + 1000 } },
]);
```

Round-trip:

```js
const raw = await keyv.getRaw("foo");
if (raw) {
	raw.value = "updated";
	await keyv.setRaw("foo", raw);
}
```

## `.delete(key)`

Delete one key, or pass an array to `.deleteMany()`. Returns `true` if the key existed.

```js
await keyv.delete("foo");
```

## `.deleteMany(keys)`

Returns `boolean[]` — one result per key.

```js
await keyv.deleteMany(["a", "b"]); // [true, false]
```

## `.has(key)` / `.hasMany(keys)`

Existence checks. Expired keys count as missing when `checkExpired` is on (default).

```js
await keyv.has("foo"); // true
await keyv.hasMany(["foo", "missing"]); // [true, false]
```

## `.clear()`

Delete every key in the **current namespace**. Emits `'clear'`.

```js
await keyv.clear();
```

## `.disconnect()`

Ask the adapter to close connections. Emits `'disconnect'`. Safe to call when the store has no `disconnect()`.

```js
await keyv.disconnect();
```

## `.iterator()`

Async generator of `[key, value]` pairs. Decodes values, skips (and deletes) expired entries when `checkExpired` is on. Yields nothing if the store has no `iterator()`.

```js
for await (const [key, value] of keyv.iterator()) {
	console.log(key, value);
}
```

## `.encode(data)` / `.decode(data)`

Public pipeline helpers. `encode` runs serialize → compress → encrypt. `decode` runs the reverse. See [Encode and Decode](/docs/encode-and-decode/).

```js
const packed = await keyv.encode({ value: "bar", expires: Date.now() + 1000 });
const envelope = await keyv.decode(packed);
```
