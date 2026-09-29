# @keyv/dynamo [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> DynamoDB storage adapter for [Keyv](https://github.com/jaredwray/keyv)

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@keyv/dynamo.svg)](https://www.npmjs.com/package/@keyv/dynamo)
[![npm](https://img.shields.io/npm/dm/@keyv/dynamo)](https://npmjs.com/package/@keyv/dynamo)

## Features

- Built on [@aws-sdk/client-dynamodb](https://www.npmjs.com/package/@aws-sdk/client-dynamodb) and [@aws-sdk/lib-dynamodb](https://www.npmjs.com/package/@aws-sdk/lib-dynamodb) with full TypeScript support
- TTL support via DynamoDB TTL on the `expiresAt` attribute. Keys set without a TTL never expire
- Namespace support for key isolation across multiple Keyv instances
- Automatic table creation with `PAY_PER_REQUEST` billing mode
- `setMany`, `getMany`, `deleteMany`, and `hasMany` batch operations
- Async `iterator` support with namespace-aware filtering
- `createKeyv` helper for quick setup

> **Note:** DynamoDB doesn't guarantee data will be deleted immediately upon expiration. See the [DynamoDB TTL documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) for details.

## Table of Contents

- [Install](#install)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Usage with NestJS](#usage-with-nestjs)
- [Migrating to v6](#migrating-to-v6)
- [Options](#options)
- [Properties](#properties)
  - [.client](#client)
  - [.namespace](#namespace)
  - [.keyPrefixSeparator](#keyprefixseparator)
  - [.tableName](#tablename)
  - [.endpoint](#endpoint)
- [Methods](#methods)
  - [constructor(options?)](#constructoroptions)
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
  - [.ensureTable(tableName)](#ensuretabletablename)
  - [.createTable(tableName)](#createtabletablename)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/dynamo
```

## Quick Start with createKeyv

```js
import { createKeyv } from '@keyv/dynamo';

const keyv = createKeyv({ endpoint: 'http://localhost:8000' });

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
import { createKeyv } from '@keyv/dynamo';

const keyv = createKeyv({
  endpoint: 'http://localhost:8000',
  tableName: 'cacheTable',
  namespace: 'my-app',
});
```

## Usage

```js
import Keyv from 'keyv';
import KeyvDynamo from '@keyv/dynamo';

const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
const keyv = new Keyv(store);

// set a value
await keyv.set('foo', 'bar');

// set a value with TTL (in milliseconds)
await keyv.set('foo', 'bar', 6000);

// get a value
const value = await keyv.get('foo');

// delete a value
await keyv.delete('foo');

// clear all values
await keyv.clear();
```

## Usage with Namespaces

```js
import Keyv from 'keyv';
import KeyvDynamo from '@keyv/dynamo';

// Keyv passes its namespace to the adapter, which stores `foo` as `namespace1:foo`.
// Give each Keyv instance its own adapter.
const store1 = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
const keyv1 = new Keyv(store1, { namespace: 'namespace1' });

const store2 = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
const keyv2 = new Keyv(store2, { namespace: 'namespace2' });

// keys are isolated by namespace
await keyv1.set('foo', 'bar1');
await keyv2.set('foo', 'bar2');

const value1 = await keyv1.get('foo'); // 'bar1'
const value2 = await keyv2.get('foo'); // 'bar2'
```

## Usage with NestJS

> **Note:** `cache-manager` 7 depends on Keyv v5. It reads expiry data with `store.get(key, { raw: true })`, which a v6 `Keyv` ignores, so `ttl()` and the refresh logic in `wrap()` stop working with a v6 store. Check which Keyv version your `cache-manager` needs with `npm view cache-manager dependencies.keyv`. See [Libraries That Embed Keyv v5](https://keyv.org/docs/migration/v5-to-v6/#libraries-that-embed-keyv-v5).

Since DynamoDB has a 400KB limit per item, compressing data can help in some cases.

### With a payload less than or equal to 400KB

```js
import { Keyv } from 'keyv'
import { KeyvDynamo } from '@keyv/dynamo'
import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            new Keyv({
              store: new KeyvDynamo({
                tableName: 'TableName',
              }),
            }),
          ],
        }
      },
    }),
  ],
})
export class InfrastructureModule {}
```

### With a payload greater than 400KB

```js
import { Keyv } from 'keyv'
import KeyvBrotli from '@keyv/compress-brotli'
import { KeyvDynamo } from '@keyv/dynamo'
import { CacheModule } from '@nestjs/cache-manager'
import { Module } from '@nestjs/common'

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        return {
          stores: [
            new Keyv({
              store: new KeyvDynamo({
                tableName: 'TableName',
              }),
              compression: new KeyvBrotli(),
            }),
          ],
        }
      },
    }),
  ],
})
export class InfrastructureModule {}
```

## Migrating to v6

- **Keys written without a TTL no longer expire.** In v5, every key written without a TTL got an expiry six hours after the write. In v6, such a key has no expiry and is kept until it is deleted. To keep a default expiry, set Keyv's `ttl` option:

```js
const keyv = new Keyv(store, { ttl: 6 * 60 * 60 * 1000 });
```

- **`sixHoursInMilliseconds` was removed.** Remove any code that reads or assigns `store.sixHoursInMilliseconds`.
- **Keys written by v5 keep the expiry they were written with** until they are written again.
- **The `ttlSupport` and `opts` properties were removed.** Use the `tableName` and `endpoint` properties instead.
- **The adapter's `set` takes an absolute `expires`.** v5's `set(key, value, ttl)` took a relative `ttl`. This only affects code that calls the adapter directly. See [.set(key, value, expires?)](#setkey-value-expires).
- **Keys written by v5 need matching namespace settings.** Keyv v6 has no default namespace.
  - v5's default setup, `new Keyv(new KeyvDynamo(options))`, stored `foo` as `keyv:foo`. Read those keys with `new Keyv(new KeyvDynamo(options), { namespace: 'keyv' })`. If you set your own namespace in v5, pass that one instead.
  - Keys written through v5's `createKeyv()` were stored without a prefix, even when you passed a `namespace`. The same is true when v5 ran with `useKeyPrefix: false`. Read those keys without a namespace. Without a namespace, `clear()` deletes every item in the table.

See the [v5 to v6 migration guide](https://keyv.org/docs/migration/v5-to-v6/#keyvdynamo-keys-without-a-ttl-no-longer-expire) for more.

## Options

Options extend [`DynamoDBClientConfig`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/) so all AWS SDK options (endpoint, region, credentials, etc.) are supported.

| Option | Type | Default | Description |
|---|---|---|---|
| `tableName` | `string` | `'keyv'` | The DynamoDB table name. Created automatically if it doesn't exist. |
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation |
| `endpoint` | `string` | — | The DynamoDB endpoint URL (e.g., `'http://localhost:8000'` for local development) |
| `uri` | `string` | — | Alias for `endpoint` (for consistency with other Keyv adapters). `endpoint` takes precedence when both are set. |
| `region` | `string` | — | The AWS region (e.g., `'us-east-1'`) |

```js
import KeyvDynamo from '@keyv/dynamo';

// Using an endpoint string
const store = new KeyvDynamo('http://localhost:8000');

// Using an options object
const store2 = new KeyvDynamo({ endpoint: 'http://localhost:8000', tableName: 'cacheTable' });
```

## Properties

### .client

The underlying `DynamoDBDocument` client instance. Can be used to access the DynamoDB client directly.

| Type | Default |
|---|---|
| `DynamoDBDocument` | Created from the options |

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

### .tableName

The DynamoDB table name in use. Read-only.

| Type | Default |
|---|---|
| `string` | `'keyv'` |

### .endpoint

The configured DynamoDB endpoint URL, if one was provided. Read-only.

| Type | Default |
|---|---|
| `string \| undefined` | `undefined` |

## Methods

### constructor(options?)

Creates a new `KeyvDynamo` instance. Automatically creates the DynamoDB table if it doesn't exist.

- `options` — A `KeyvDynamoOptions` object or an endpoint string. Defaults to `{ tableName: 'keyv' }`.

```js
import KeyvDynamo from '@keyv/dynamo';

// Using an endpoint string
const store = new KeyvDynamo('http://localhost:8000');

// Using an options object
const store2 = new KeyvDynamo({ endpoint: 'http://localhost:8000', tableName: 'cacheTable' });
```

### .get(key)

Retrieves a value from DynamoDB. Returns the stored value or `undefined` if the key does not exist.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const result = await store.get('foo'); // 'bar'
```

### .getMany(keys)

Retrieves multiple values from DynamoDB. Returns an array of stored data corresponding to each key.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.getMany(['key1', 'key2']);
```

### .set(key, value, expires?)

Stores a value in DynamoDB. With `expires`, the item records it in `expiresAt` (seconds), which DynamoDB TTL uses to delete the item, and in `expiresAtMs` (milliseconds), which reads check so an expired item is never returned. Without `expires`, the item has no expiry and is kept until it is deleted. Returns `true` on success, `false` on failure.

> When you call the adapter directly, the third argument is an **absolute** `expires` timestamp (Unix ms since epoch), not a relative duration. Through Keyv (`keyv.set(key, value, ttl)`) you still pass a relative TTL — Keyv converts it to `expires` for you.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar'); // never expires
await store.set('foo', 'bar', Date.now() + 60000); // expires in ~60 seconds
```

### .setMany(entries)

Stores multiple values in DynamoDB using `BatchWriteItem` in chunks of 25. Each entry is a `KeyvStorageEntry<Value>` object (`{ key: string, value: Value, expires?: number }`), where `expires` is an absolute Unix ms timestamp as in `.set()`, and `Value` is inferred from the entries provided. Returns a `boolean[]` with per-entry success tracking — any items reported as `UnprocessedItems` by DynamoDB are marked as `false`.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
const results = await store.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', expires: Date.now() + 60000 },
]); // [true, true]
```

### .delete(key)

Deletes a key from DynamoDB. Returns `true` if the key was deleted, `false` otherwise.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const deleted = await store.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from DynamoDB. Returns a `boolean[]` indicating whether each key was deleted.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.deleteMany(['key1', 'key2']); // [true, true]
```

### .clear()

Clears data from DynamoDB. If a namespace is set, only keys with the namespace prefix are deleted. Otherwise, all keys are deleted. It scans the whole table, one page per 1 MB of data, so it reads every item in the table even when a namespace is set.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.clear();
```

### .has(key)

Checks whether a key exists in DynamoDB.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('foo', 'bar');
const exists = await store.has('foo'); // true
const missing = await store.has('baz'); // false
```

### .hasMany(keys)

Checks whether multiple keys exist in DynamoDB. Returns an array of booleans corresponding to each key.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');
const results = await store.hasMany(['key1', 'key2', 'key3']); // [true, true, false]
```

### .iterator()

Returns an async iterator over all `[key, value]` pairs in the store. If a namespace is set, only keys with that namespace are yielded and the namespace prefix is removed from the returned keys. The namespace does not need to be passed in — it uses the namespace configured on the adapter. Expired entries are skipped and deleted.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.set('key1', 'value1');
await store.set('key2', 'value2');

for await (const [key, value] of store.iterator()) {
  console.log(key, value);
}
```

### .disconnect()

Disconnects from the DynamoDB client. This is a no-op for DynamoDB since it communicates over HTTP requests and does not maintain a persistent connection.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.disconnect();
```

### .formatKey(key)

Formats a key by prepending the namespace if one is set. A key that already starts with the namespace prefix gets it again, so `myapp:foo` and `foo` stay separate keys.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
store.formatKey('foo'); // 'foo'

store.namespace = 'myapp';
store.formatKey('foo'); // 'myapp:foo'
store.formatKey('myapp:foo'); // 'myapp:myapp:foo'
```

### .createKeyPrefix(key, namespace?)

Creates a prefixed key by prepending the namespace and separator. Returns the key as-is if no namespace is provided.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
store.createKeyPrefix('key', 'ns'); // 'ns:key'
store.createKeyPrefix('key'); // 'key'
```

### .removeKeyPrefix(key, namespace?)

Removes the namespace prefix from the start of a key. Returns the key as-is if no namespace is provided or the key does not start with the prefix.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
store.removeKeyPrefix('ns:key', 'ns'); // 'key'
store.removeKeyPrefix('key'); // 'key'
```

### .ensureTable(tableName)

Ensures the DynamoDB table exists and is active. If the table is in `CREATING` status, waits for it to become active. If it doesn't exist, creates it.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.ensureTable('my-table');
```

### .createTable(tableName)

Creates a new DynamoDB table with TTL support enabled on the `expiresAt` attribute. Uses `PAY_PER_REQUEST` billing mode.

```js
const store = new KeyvDynamo({ endpoint: 'http://localhost:8000' });
await store.createTable('my-table');
```

## License

[MIT © Jared Wray](LICENSE)
