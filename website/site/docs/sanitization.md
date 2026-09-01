---
title: Sanitization
order: 9
description: Strip SQL, Mongo, path-traversal, and control-character patterns from keys and namespaces.
---

# Sanitization

Sanitization is **off** by default. When enabled, Keyv strips dangerous *patterns* from keys and namespaces before they reach the store. Harmless characters such as quotes, slashes, and dollar signs in the middle of a string pass through.

Results are cached in an LRU (10,000 entries) so repeated keys are cheap.

## Enable it

```js
const keyv = new Keyv({
	sanitize: { keys: true, namespace: true },
});

await keyv.set("test; DROP TABLE", "value");
// stored as "test DROP TABLE"

await keyv.set("user's-data", "value");
// unchanged
```

Omitting `sanitize`, or setting both targets to `false`, leaves keys and namespaces untouched.

## Pattern categories

| Category | Patterns stripped | Purpose |
| --- | --- | --- |
| `sql` | `;` `--` `/*` | SQL injection fragments |
| `mongo` | leading `$`, `{$` sequences | MongoDB operator injection |
| `escape` | `\0` `\r` `\n` | Null bytes and CRLF |
| `path` | `../` `..\` | Path traversal |

## Targets

| Target | Default when enabled | Applies to |
| --- | --- | --- |
| `keys` | all categories | Every key-accepting method |
| `namespace` | `true` | Constructor and `namespace` setter |

Methods that sanitize keys: `get`, `set`, `delete`, `has`, `getMany`, `setMany`, `deleteMany`, `hasMany`, `getRaw`, `getManyRaw`, `setRaw`, `setManyRaw`.

Empty keys after sanitization cause `set` / `delete` / `has` / `get` to no-op (`false` / `undefined`).

## Granular control

```js
const keyv = new Keyv({
	sanitize: {
		keys: { sql: true, mongo: false },
		namespace: { path: true, sql: false },
	},
});
```

Disable namespace sanitization only:

```js
const keyv = new Keyv({
	sanitize: { keys: true, namespace: false },
});
```

## Change at runtime

```js
import { KeyvSanitize } from "keyv";

keyv.sanitize.updateOptions({ keys: true, namespace: true });
keyv.sanitize.updateOptions({ keys: { sql: true, mongo: false } });
keyv.sanitize = new KeyvSanitize({ keys: true, namespace: true });
```

`keyv.sanitize.enabled` is `true` when any category is on for keys or namespace.

Sanitization is not a substitute for parameterized queries or adapter-level escaping. It is a Defense-in-Depth filter for untrusted key material. See [SECURITY.md](https://github.com/jaredwray/keyv/blob/main/SECURITY.md) in the repository.
