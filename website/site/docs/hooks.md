---
title: Hooks
order: 6
description: before/after hooks for get, set, delete, has, clear, disconnect, and raw APIs. Includes deprecated PRE_/POST_ aliases.
---

# Hooks

Every Keyv operation fires a `before:*` hook, then the store call, then an `after:*` hook. Hooks can observe or mutate the payload (for example prefixing keys on `BEFORE_SET`).

Register handlers with `onHook()` or `addHook()` from [Hookified](https://hookified.org). Import names from `KeyvHooks`.

```js
import Keyv, { KeyvHooks } from "keyv";

const keyv = new Keyv();

keyv.onHook(KeyvHooks.BEFORE_SET, (data) => {
	console.log(`Setting ${data.key}`);
});
```

`addHook(event, handler)` is the same registration API used in the test suite.

## Hook names (`KeyvHooks`)

| Before | After | Operation |
| --- | --- | --- |
| `BEFORE_SET` (`before:set`) | `AFTER_SET` (`after:set`) | `set` |
| `BEFORE_SET_MANY` (`before:setMany`) | `AFTER_SET_MANY` (`after:setMany`) | `setMany` |
| `BEFORE_SET_RAW` (`before:setRaw`) | `AFTER_SET_RAW` (`after:setRaw`) | `setRaw` |
| `BEFORE_SET_MANY_RAW` (`before:setManyRaw`) | `AFTER_SET_MANY_RAW` (`after:setManyRaw`) | `setManyRaw` |
| `BEFORE_GET` (`before:get`) | `AFTER_GET` (`after:get`) | `get` |
| `BEFORE_GET_MANY` (`before:getMany`) | `AFTER_GET_MANY` (`after:getMany`) | `getMany` |
| `BEFORE_GET_RAW` (`before:getRaw`) | `AFTER_GET_RAW` (`after:getRaw`) | `getRaw` |
| `BEFORE_GET_MANY_RAW` (`before:getManyRaw`) | `AFTER_GET_MANY_RAW` (`after:getManyRaw`) | `getManyRaw` |
| `BEFORE_DELETE` (`before:delete`) | `AFTER_DELETE` (`after:delete`) | `delete` |
| `BEFORE_DELETE_MANY` (`before:deleteMany`) | `AFTER_DELETE_MANY` (`after:deleteMany`) | `deleteMany` |
| `BEFORE_HAS` (`before:has`) | `AFTER_HAS` (`after:has`) | `has` |
| `BEFORE_HAS_MANY` (`before:hasMany`) | `AFTER_HAS_MANY` (`after:hasMany`) | `hasMany` |
| `BEFORE_CLEAR` (`before:clear`) | `AFTER_CLEAR` (`after:clear`) | `clear` |
| `BEFORE_DISCONNECT` (`before:disconnect`) | `AFTER_DISCONNECT` (`after:disconnect`) | `disconnect` |

## Mutating `BEFORE_SET`

The object passed to `BEFORE_SET` is `{ key, value, ttl }`. Mutations are used for the write.

```js
keyv.onHook(KeyvHooks.BEFORE_SET, (data) => {
	data.key = `prefix-${data.key}`;
	data.value = { wrapped: data.value };
});
```

## Hits and misses

`AFTER_GET` and `AFTER_GET_RAW` run on both hits and misses. A miss (missing or expired) passes `undefined` as the value.

```js
keyv.onHook(KeyvHooks.AFTER_GET, (data) => {
	if (data.value === undefined) {
		console.log("miss", data.key);
	} else {
		console.log("hit", data.key, data.value);
	}
});
```

## Delete hooks

`delete()` accepts a single key or an array (which delegates to `deleteMany`). `BEFORE_DELETE` / `AFTER_DELETE` therefore see either a string or an array. Prefer `BEFORE_DELETE_MANY` / `AFTER_DELETE_MANY` for batch deletes. Keyv still fires the single-key delete hooks from `deleteMany` for backward compatibility.

## Deprecated `PRE_*` / `POST_*` names

The v5 names (`PRE_SET` → `"preSet"`, `POST_GET` → `"postGet"`, …) still fire if anything is subscribed to them. Keyv emits deprecation warnings. Use `BEFORE_*` / `AFTER_*` going forward.

```js
// works, but deprecated
keyv.addHook(KeyvHooks.PRE_SET, () => {});
```

## Hook errors

`throwOnHookError` defaults to `false`. A throwing hook emits `'error'` instead of failing the Keyv call. Set `keyv.throwOnHookError = true` if a hook failure should fail the operation.
