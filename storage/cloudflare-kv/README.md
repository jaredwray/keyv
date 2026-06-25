# @keyv/cloudflare-kv [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Cloudflare Workers KV storage adapter for [Keyv](https://github.com/jaredwray/keyv)

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/cloudflare-kv.svg)](https://www.npmjs.com/package/@keyv/cloudflare-kv)
[![npm](https://img.shields.io/npm/dm/@keyv/cloudflare-kv)](https://npmjs.com/package/@keyv/cloudflare-kv)

Use [Cloudflare Workers KV](https://developers.cloudflare.com/kv/) as a Keyv storage backend in one of two **modes**:

- **`bind`** (default) — a native KV **binding**, the object exposed as `env.MY_KV` inside a Cloudflare Worker (or a [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/) namespace in tests). Use this when your code runs inside the Workers runtime.
- **`rest`** — the Cloudflare **REST API**, authenticated with account credentials. Use this from any plain Node.js process (a server, a job, a CLI) that can't get a Worker binding.

## Features

- Two transport modes — `bind` (native binding, default) and `rest` (REST API) — selectable via the `mode` option
- Millisecond-precise TTLs enforced client-side, with a native KV `expirationTtl` set for longer TTLs so Cloudflare reclaims space on its own
- Namespace support for key isolation across multiple Keyv instances
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations
- Async `iterator` support with namespace-aware filtering and automatic pagination
- Fully testable locally with Miniflare — no Cloudflare account required
- `createKeyv` helper for quick setup

> **Note:** Cloudflare KV is eventually consistent. Writes are read-your-write within the location that wrote them but may take up to 60 seconds to propagate globally, and KV's native expiry has a 60-second minimum. This adapter stores an expiry timestamp alongside each value and enforces it on read, so TTLs behave precisely regardless of the native minimum. See the [Cloudflare KV docs](https://developers.cloudflare.com/kv/concepts/how-kv-works/) for details.

## Table of Contents

- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage with a Worker Binding](#usage-with-a-worker-binding)
- [Usage with the REST API](#usage-with-the-rest-api)
- [Usage with Namespaces](#usage-with-namespaces)
- [Testing Locally with Miniflare](#testing-locally-with-miniflare)
- [How Values Are Stored](#how-values-are-stored)
- [Options](#options)
- [Properties](#properties)
- [Methods](#methods)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/cloudflare-kv
```

## Quick Start with createKeyv

```js
import { createKeyv } from '@keyv/cloudflare-kv';

// REST mode (from any Node.js process)
const keyv = createKeyv({
  mode: 'rest',
  accountId: process.env.CF_ACCOUNT_ID,
  namespaceId: process.env.CF_KV_NAMESPACE_ID,
  apiToken: process.env.CF_API_TOKEN,
});

// set a value
await keyv.set('foo', 'bar');

// get a value
const value = await keyv.get('foo');

// set with TTL (milliseconds)
await keyv.set('foo', 'bar', 60000);

// delete a value
await keyv.delete('foo');
```

## Usage with a Worker Binding

Inside a Cloudflare Worker, pass the binding (e.g. `env.MY_KV`) directly:

```js
import Keyv from 'keyv';
import KeyvCloudflareKV from '@keyv/cloudflare-kv';

export default {
  async fetch(request, env) {
    // `bind` is the default mode; passing a binding is all you need.
    const store = new KeyvCloudflareKV({ kvNamespace: env.MY_KV });
    const keyv = new Keyv(store, { useKeyPrefix: false });

    await keyv.set('foo', 'bar');
    return new Response(await keyv.get('foo'));
  },
};
```

You can also pass the binding directly as the only argument:

```js
const store = new KeyvCloudflareKV(env.MY_KV);
```

## Usage with the REST API

From a regular Node.js server, set `mode: 'rest'` and authenticate with a Cloudflare API token that
has the `Workers KV Storage` Edit permission:

```js
import Keyv from 'keyv';
import KeyvCloudflareKV from '@keyv/cloudflare-kv';

const store = new KeyvCloudflareKV({
  mode: 'rest',
  accountId: 'your-account-id',
  namespaceId: 'your-kv-namespace-id',
  apiToken: 'your-api-token',
});

const keyv = new Keyv(store, { useKeyPrefix: false });

await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar'
```

> `mode` defaults to `'bind'`. If you omit it, the adapter infers `'rest'` when you pass REST
> credentials and `'bind'` when you pass a binding — but setting it explicitly is recommended.

## Usage with Namespaces

```js
import Keyv from 'keyv';
import KeyvCloudflareKV from '@keyv/cloudflare-kv';

const store1 = new KeyvCloudflareKV({ kvNamespace, namespace: 'namespace1' });
const keyv1 = new Keyv(store1, { namespace: 'namespace1', useKeyPrefix: false });

const store2 = new KeyvCloudflareKV({ kvNamespace, namespace: 'namespace2' });
const keyv2 = new Keyv(store2, { namespace: 'namespace2', useKeyPrefix: false });

// keys are isolated by namespace
await keyv1.set('foo', 'bar1');
await keyv2.set('foo', 'bar2');

const value1 = await keyv1.get('foo'); // 'bar1'
const value2 = await keyv2.get('foo'); // 'bar2'
```

## Testing Locally with Miniflare

The adapter accepts any object implementing the Cloudflare `KVNamespace` interface, so you can
test against a real local KV — no account needed — using
[Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/):

```js
import { Miniflare } from 'miniflare';
import KeyvCloudflareKV from '@keyv/cloudflare-kv';

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } };",
  kvNamespaces: ['KV'],
});

const kvNamespace = await mf.getKVNamespace('KV');
const store = new KeyvCloudflareKV({ kvNamespace });

await store.set('foo', 'bar');
console.log(await store.get('foo')); // 'bar'

await mf.dispose();
```

### How this package is tested

The test suite runs against a **real local Cloudflare KV**, not in-memory stubs:

- **`bind` mode** is tested directly against a Miniflare KV namespace.
- **`rest` mode** is tested end-to-end against a small local HTTP server that implements the
  Cloudflare KV REST API on top of that *same* Miniflare namespace — so the REST client exercises
  real local storage rather than mocked `fetch` responses.

This local server emulates Cloudflare's live REST environment. We keep it in sync with the
Cloudflare API and additionally run a **live integration test** (the `cloudflare-keyv-integration`
GitHub workflow) against the real Cloudflare KV API, so we notice if the live behavior ever drifts
from the emulation. That workflow requires the `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`,
and `CLOUDFLARE_API_TOKEN` repository secrets and self-skips when they are absent.

## How Values Are Stored

Keyv owns serialization, so the adapter stores the **already-serialized value string directly** —
it does not wrap values in its own JSON envelope. The absolute expiry is stored in Cloudflare KV
**metadata** (`{ e: <unix-ms> }`) rather than mixed into the value.

Because KV's native expiry has a 60-second minimum, the adapter enforces expiry on every read using
that metadata, so TTLs are millisecond-precise. For TTLs longer than 60 seconds it additionally
passes a native KV `expirationTtl`, so Cloudflare reclaims the entry on its own.

> When used directly (not through Keyv), the adapter expects string values, since KV only stores
> strings. A non-string passed directly is coerced with `String()`. Wrap the adapter in a `Keyv`
> instance to store arbitrary values.

## Options

For **`bind`** mode provide a `kvNamespace` binding; for **`rest`** mode provide `accountId`,
`namespaceId`, and `apiToken`.

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'bind' \| 'rest'` | `'bind'` | Transport to use. Inferred from the other options when omitted. |
| `kvNamespace` | `KVNamespace` | — | A Cloudflare KV binding (Worker binding or Miniflare namespace). Used by `bind` mode. |
| `accountId` | `string` | — | Cloudflare account ID (`rest` mode). |
| `namespaceId` | `string` | — | KV namespace ID — not the binding name (`rest` mode). |
| `apiToken` | `string` | — | Cloudflare API token with Workers KV Edit permission (`rest` mode). |
| `url` | `string` | `https://api.cloudflare.com/client/v4` | Override the REST base URL (`rest` mode). |
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation. |
| `keyPrefixSeparator` | `string` | `':'` | Separator placed between the namespace and key. |

## Properties

### .mode

The resolved transport mode in use. Read-only.

| Type | Default |
|---|---|
| `'bind' \| 'rest'` | `'bind'` |

### .client

The underlying `KVNamespace` (a binding or the built-in `CloudflareKVRestClient`). Useful for
direct, low-level access.

| Type | Default |
|---|---|
| `CloudflareKVNamespace` | Derived from the options |

### .namespace

Key prefix for namespace isolation. When set, all keys are prefixed with `namespace:`.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

### .keyPrefixSeparator

The separator between the namespace and key.

| Type | Default |
|---|---|
| `string` | `':'` |

## Methods

### constructor(options)

Creates a new `KeyvCloudflareKV` instance. Pass a `KeyvCloudflareKVOptions` object or a Cloudflare
KV binding directly.

```js
import KeyvCloudflareKV from '@keyv/cloudflare-kv';

// Binding
const store = new KeyvCloudflareKV({ kvNamespace });

// REST credentials
const store2 = new KeyvCloudflareKV({ accountId, namespaceId, apiToken });
```

### .get(key)

Retrieves a value. Returns the stored value or `undefined` if the key does not exist or has expired.

### .getMany(keys)

Retrieves multiple values. Returns an array of values (`undefined` for missing/expired keys).

### .set(key, value, expires?)

Stores a value with an optional absolute `expires` timestamp (Unix ms since epoch).

### .setMany(entries)

Stores multiple `{ key, value, expires? }` entries. Returns a `boolean[]` with per-entry success.

### .delete(key)

Deletes a key. Returns `true` if the key existed, `false` otherwise.

### .deleteMany(keys)

Deletes multiple keys. Returns a `boolean[]` indicating which keys existed.

### .clear()

Clears the store. If a namespace is set, only keys with that prefix are deleted; otherwise all keys
in the KV namespace are removed.

### .has(key)

Returns `true` if a key exists and is not expired, `false` otherwise.

### .hasMany(keys)

Returns a `boolean[]` indicating whether each key exists.

### .iterator()

Returns an async iterator over `[key, value]` pairs. When a namespace is set, only namespaced keys
are yielded and the prefix is stripped from the returned keys. Pagination is handled automatically.

```js
for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

No-op. Cloudflare KV uses stateless HTTP requests / in-process bindings, so there is no connection
to close.

### .formatKey(key) / .createKeyPrefix(key, namespace?) / .removeKeyPrefix(key, namespace?)

Namespace-aware key helpers, matching the other Keyv adapters.

## License

[MIT © Jared Wray](LICENSE)
