# @keyv/aws-ssm [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> AWS SSM (Systems Manager Parameter Store) storage adapter for [Keyv](https://github.com/jaredwray/keyv)

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/aws-ssm.svg)](https://www.npmjs.com/package/@keyv/aws-ssm)
[![npm](https://img.shields.io/npm/dm/@keyv/aws-ssm)](https://npmjs.com/package/@keyv/aws-ssm)

## Features

- Built on [@aws-sdk/client-ssm](https://www.npmjs.com/package/@aws-sdk/client-ssm) with full TypeScript support
- **You provide the `SSMClient`** — the adapter never creates or owns one, so your app's own credentials, region, and retry configuration are used as-is
- All parameter names are **prefixed** (default `/keyv/`), which both namespaces your data and acts as a safety boundary: `clear()`/`iterator()` only ever touch parameters under that prefix
- Client-side, millisecond-precise TTL support via a small JSON envelope (Parameter Store has no native per-parameter expiry)
- Namespace support for key isolation across multiple Keyv instances sharing one client
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations, automatically chunked to respect AWS's 10-name-per-call limit
- Configurable parameter `type` (`String` / `StringList` / `SecureString`) and `tier` (`Standard` / `Advanced` / `IntelligentTiering`), including KMS `keyId` for `SecureString`
- Async `iterator` support with namespace-aware filtering, fully paginated
- `createKeyv` helper for quick setup

> **Note:** Parameter Store has no reliable native per-key TTL. Expiry is enforced by the adapter on every read (`get`/`getMany`/`has`/`hasMany`/`iterator`), with lazy deletion of expired parameters — the same approach used by [@keyv/etcd](https://github.com/jaredwray/keyv/tree/main/storage/etcd).

## Table of Contents

- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Usage with SecureString](#usage-with-securestring)
- [Options](#options)
- [Properties](#properties)
  - [.client](#client)
  - [.namespace](#namespace)
  - [.keyPrefix](#keyprefix)
  - [.keyPrefixSeparator](#keyprefixseparator)
  - [.type](#type)
  - [.tier](#tier)
  - [.keyId](#keyid)
- [Methods](#methods)
  - [constructor(options)](#constructoroptions)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.iterator()](#iterator)
  - [.disconnect()](#disconnect)
  - [.formatKey(key)](#formatkeykey)
  - [.createKeyPrefix(key, namespace?)](#createkeyprefixkey-namespace)
  - [.removeKeyPrefix(key, namespace?)](#removekeyprefixkey-namespace)
- [Parameter Store limits](#parameter-store-limits)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/aws-ssm @aws-sdk/client-ssm
```

## Quick Start with createKeyv

```js
import { SSMClient } from '@aws-sdk/client-ssm';
import { createKeyv } from '@keyv/aws-ssm';

const client = new SSMClient({ region: 'us-east-1' });
const keyv = createKeyv({ client });

// set a value
await keyv.set('foo', 'bar');

// get a value
const value = await keyv.get('foo');

// set with TTL (milliseconds)
await keyv.set('foo', 'bar', 6000);

// delete a value
await keyv.delete('foo');
```

You can also pass options:

```js
import { SSMClient } from '@aws-sdk/client-ssm';
import { createKeyv } from '@keyv/aws-ssm';

const keyv = createKeyv({
  client: new SSMClient({ region: 'us-east-1' }),
  keyPrefix: '/my-app/',
  namespace: 'cache',
});
```

## Usage

```js
import Keyv from 'keyv';
import { SSMClient } from '@aws-sdk/client-ssm';
import KeyvAwsSsm from '@keyv/aws-ssm';

const client = new SSMClient({ region: 'us-east-1' });
const store = new KeyvAwsSsm({ client });
const keyv = new Keyv({ store });

// set a value
await keyv.set('foo', 'bar');

// set a value with TTL (in milliseconds)
await keyv.set('foo', 'bar', 6000);

// get a value
const value = await keyv.get('foo');

// delete a value
await keyv.delete('foo');

// clear all values under the configured keyPrefix
await keyv.clear();
```

## Usage with Namespaces

```js
import Keyv from 'keyv';
import { SSMClient } from '@aws-sdk/client-ssm';
import KeyvAwsSsm from '@keyv/aws-ssm';

const client = new SSMClient({ region: 'us-east-1' });

const store1 = new KeyvAwsSsm({ client });
const keyv1 = new Keyv({ store: store1, namespace: 'namespace1' });

const store2 = new KeyvAwsSsm({ client });
const keyv2 = new Keyv({ store: store2, namespace: 'namespace2' });

// keys are isolated by namespace: namespace1's keys live under
// /keyv/namespace1/... and namespace2's under /keyv/namespace2/...
await keyv1.set('foo', 'bar1');
await keyv2.set('foo', 'bar2');

const value1 = await keyv1.get('foo'); // 'bar1'
const value2 = await keyv2.get('foo'); // 'bar2'
```

## Usage with SecureString

Use `type: 'SecureString'` (optionally with a `keyId`) to encrypt values at rest via KMS. This requires `kms:Decrypt`/`kms:Encrypt` permissions on the client's IAM identity in addition to the usual SSM permissions.

```js
import { SSMClient } from '@aws-sdk/client-ssm';
import KeyvAwsSsm from '@keyv/aws-ssm';

const store = new KeyvAwsSsm({
  client: new SSMClient({ region: 'us-east-1' }),
  type: 'SecureString',
  keyId: 'alias/my-app-key', // optional — defaults to the AWS-managed alias/aws/ssm key
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `client` | `SSMClient` | — | **Required.** The AWS SDK v3 `SSMClient` instance used for all operations. The adapter never creates or destroys it. |
| `keyPrefix` | `string` | `'/keyv/'` | Path-style prefix prepended to every parameter name. Normalized to always start and end with `/`. |
| `namespace` | `string` | `undefined` | Optional namespace inserted between `keyPrefix` and the key. |
| `keyPrefixSeparator` | `string` | `'/'` | Separator between the namespace and key segments. SSM parameter names don't allow `:`, so this differs from most other Keyv adapters. |
| `type` | `'String' \| 'StringList' \| 'SecureString'` | `'String'` | The SSM parameter type used when writing values. |
| `tier` | `'Standard' \| 'Advanced' \| 'IntelligentTiering'` | `'Standard'` | The SSM parameter tier used when writing values. |
| `keyId` | `string` | `undefined` | KMS key ID, alias, or ARN used to encrypt values when `type` is `SecureString`. |

```js
import { SSMClient } from '@aws-sdk/client-ssm';
import KeyvAwsSsm from '@keyv/aws-ssm';

const store = new KeyvAwsSsm({
  client: new SSMClient({ region: 'us-east-1' }),
  keyPrefix: '/my-app/',
  tier: 'Advanced',
});
```

## Properties

### .client

The underlying `SSMClient` instance provided at construction. Can be reassigned, but is never destroyed by the adapter.

| Type | Default |
|---|---|
| `SSMClient` | The client passed in via options |

### .namespace

Optional namespace inserted between `keyPrefix` and the key.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

### .keyPrefix

The path-style prefix prepended to every parameter name. Always normalized to start and end with `/`.

| Type | Default |
|---|---|
| `string` | `'/keyv/'` |

### .keyPrefixSeparator

The separator between the namespace and key segments.

| Type | Default |
|---|---|
| `string` | `'/'` |

### .type

The SSM parameter type used when writing values.

| Type | Default |
|---|---|
| `'String' \| 'StringList' \| 'SecureString'` | `'String'` |

### .tier

The SSM parameter tier used when writing values.

| Type | Default |
|---|---|
| `'Standard' \| 'Advanced' \| 'IntelligentTiering'` | `'Standard'` |

### .keyId

The KMS key ID, alias, or ARN used to encrypt values when `type` is `SecureString`.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

## Methods

### constructor(options)

Creates a new `KeyvAwsSsm` instance. `options.client` is required — an error is thrown if it's missing.

```js
import { SSMClient } from '@aws-sdk/client-ssm';
import KeyvAwsSsm from '@keyv/aws-ssm';

const store = new KeyvAwsSsm({ client: new SSMClient({ region: 'us-east-1' }) });
```

### .get(key)

Retrieves a value from Parameter Store. Returns the stored value, or `undefined` if the key does not exist or has expired.

```js
await store.set('foo', 'bar');
const result = await store.get('foo'); // 'bar'
```

### .getMany(keys)

Retrieves multiple values, batched into groups of 10 names per `GetParameters` call (an AWS-enforced limit). Returns an array of values corresponding to each key, with `undefined` for missing or expired entries.

```js
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.getMany(['key1', 'key2']);
```

### .set(key, value, expires?)

Stores a value, wrapped with its absolute `expires` (Unix ms since epoch) so reads can enforce expiry precisely — Parameter Store has no native per-key TTL.

```js
await store.set('foo', 'bar');

// with TTL (milliseconds)
await store.set('foo', 'bar', 60000);
```

### .setMany(entries)

Stores multiple values. AWS has no batch `PutParameter` API, so entries are written with individual, parallel `PutParameter` calls. Each entry is a `KeyvEntry<Value>` object (`{ key: string, value: Value, expires?: number }`). Returns a `boolean[]` with per-entry success tracking.

```js
const results = await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', expires: Date.now() + 60000 },
]); // [true, true]
```

### .delete(key)

Deletes a key from Parameter Store. Returns `true` if the key was deleted, `false` if it didn't exist.

```js
await store.set('foo', 'bar');
const deleted = await store.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys, batched into groups of 10 names per `DeleteParameters` call (an AWS-enforced limit). Returns a `boolean[]` indicating whether each key was deleted.

```js
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.deleteMany(['key1', 'key2']); // [true, true]
```

### .clear()

Clears data from Parameter Store. If a namespace is set, only parameters under `keyPrefix + namespace` are deleted. Otherwise, all parameters under `keyPrefix` are deleted — never anything outside of it.

```js
await store.clear();
```

### .has(key)

Checks whether a key exists (and has not expired).

```js
await store.set('foo', 'bar');
const exists = await store.has('foo'); // true
const missing = await store.has('baz'); // false
```

### .hasMany(keys)

Checks whether multiple keys exist, batched the same way as `getMany`. Returns an array of booleans corresponding to each key.

```js
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.hasMany(['key1', 'key2', 'key3']); // [true, true, false]
```

### .iterator()

Returns an async iterator over all `[key, value]` pairs under the configured `keyPrefix` (and `namespace`, if set), fully paginated through `GetParametersByPath`. Keys are returned without the prefix. Expired entries are skipped and deleted.

```js
await store.set('key1', 'value1');
await store.set('key2', 'value2');

for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

This is a no-op: the `SSMClient` is caller-provided and may be shared/reused elsewhere in your application, so the adapter never closes or destroys it.

```js
await store.disconnect();
```

### .formatKey(key)

Formats a key into its fully qualified SSM parameter name: `keyPrefix` + namespace (if set) + key. Avoids double-prefixing if the key already starts with `keyPrefix`.

```js
const store = new KeyvAwsSsm({ client });
store.formatKey('foo'); // '/keyv/foo'

store.namespace = 'myapp';
store.formatKey('foo'); // '/keyv/myapp/foo'
```

### .createKeyPrefix(key, namespace?)

Creates a prefixed key by prepending the namespace and separator. Returns the key as-is if no namespace is provided.

```js
store.createKeyPrefix('key', 'ns'); // 'ns/key'
store.createKeyPrefix('key'); // 'key'
```

### .removeKeyPrefix(key, namespace?)

Removes the namespace prefix from a key. Returns the key as-is if no namespace is provided.

```js
store.removeKeyPrefix('ns/key', 'ns'); // 'key'
store.removeKeyPrefix('key'); // 'key'
```

## Parameter Store limits

This adapter is subject to a few AWS Systems Manager Parameter Store constraints worth knowing about:

- **Naming**: parameter names may only contain letters, numbers, `.`, `-`, `_`, and `/` as a hierarchy delimiter (no `:`), must start with `/` once prefixed, and support up to 15 levels of hierarchy.
- **Value size**: `Standard` tier values are limited to 4 KB; `Advanced` and `IntelligentTiering` allow up to 8 KB (minus the small JSON envelope overhead used for TTL tracking).
- **Throughput**: `GetParameters`/`DeleteParameters` accept at most 10 names per call — `getMany`/`hasMany`/`deleteMany` chunk automatically, but very large batches still make multiple sequential AWS calls and may be subject to SSM's API rate limits.
- **Reserved prefix**: don't set `keyPrefix` to anything starting with `aws` (case-insensitive) — that hierarchy is reserved by AWS.

## License

[MIT © Jared Wray](LICENSE)
