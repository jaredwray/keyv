# @keyv/memcache [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Memcache storage adapter for [Keyv](https://github.com/jaredwray/keyv) using the [memcache](https://github.com/jaredwray/memcache) client


[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/memcache)](https://npmjs.com/package/@keyv/memcache)

## Features

- Built on the [memcache](https://github.com/jaredwray/memcache) package with a fully Promise-based API and TypeScript types
- TTL support (millisecond input, converted to seconds for memcache)
- Namespace support for key isolation across multiple Keyv instances
- Multiple nodes with consistent hashing (KetamaHash)
- SASL authentication support
- AWS ElastiCache Auto Discovery support
- Retry and backoff support for failed commands
- `createKeyv` helper for quick setup

## Table of Contents

- [Features](#features)
- [Install](#install)
- [Keyv Compression is not Supported](#keyv-compression-is-not-supported)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [Keys Memcached Can't Store](#keys-memcached-cant-store)
- [How `clear()` Works](#how-clear-works)
- [Options](#options)
- [Multiple Nodes](#multiple-nodes)
- [SASL Authentication](#sasl-authentication)
- [AWS ElastiCache Auto Discovery](#aws-elasticache-auto-discovery)
- [API](#api)
  - [constructor(uri?, options?)](#constructoruri-options)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, expires?)](#setkey-value-expires)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.disconnect()](#disconnect)
  - [.formatKey(key)](#formatkeykey)
  - [Properties](#properties)
- [Works with Memcached and Google Cloud](#works-with-memcached-and-google-cloud)
  - [Using Memcached](#using-memcached)
  - [Using Google Cloud](#using-google-cloud)
- [Breaking Changes from v2 to v6](#breaking-changes-from-v2-to-v6)
  - [Underlying Client Changed from `memjs` to `memcache`](#underlying-client-changed-from-memjs-to-memcache)
  - [`client` Property Type Changed](#client-property-type-changed)
  - [`KeyvMemcacheOptions` Type Changed](#keyvmemcacheoptions-type-changed)
  - [`disconnect()` Method Added](#disconnect-method-added)
  - [`buffer` Dependency Removed](#buffer-dependency-removed)
  - [`set` Takes an Absolute `expires`](#set-takes-an-absolute-expires)
  - [`clear()` Only Removes the Store's Own Entries](#clear-only-removes-the-stores-own-entries)
- [License](#license)

## Install

```shell
npm install --save @keyv/memcache
```

## Keyv Compression is not Supported

This package does not support compression. If you need compression, please use the `@keyv/redis` or another service package instead.

## Expiration Granularity

Expiry is enforced server-side by Memcached's `exptime`, which is **second-granular**. TTLs are accepted in milliseconds and rounded up to whole seconds, so Memcached itself can return a value for up to ~1 second past a sub-second (or just-elapsed) deadline before it evicts it. Keyv filters expired reads at its own layer by default (`checkExpired` defaults to `true`), using the absolute `expires` stored with the value, so reads are millisecond-precise out of the box even though Memcached's eviction is coarser. If you prefer to trust Memcached's `exptime` alone (and skip the extra decode on reads), opt out:

```js
const keyv = new Keyv({ store: new KeyvMemcache('localhost:11211'), checkExpired: false });
```

## Quick Start with createKeyv

The `createKeyv` helper creates a `Keyv` instance with a Memcache store in a single call:

```js
import { createKeyv } from '@keyv/memcache';

const keyv = createKeyv('localhost:11211');
keyv.on('error', handleConnectionError);

// set a value
await keyv.set('foo', 'bar', 6000);

// get a value
const value = await keyv.get('foo');

// delete a value
await keyv.delete('foo');
```

You can also pass an options object:

```js
import { createKeyv } from '@keyv/memcache';

const keyv = createKeyv({ nodes: ['localhost:11211'] });
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache('localhost:11211');
const keyv = new Keyv({ store: memcache });
keyv.on('error', handleConnectionError);

//set
await keyv.set("foo","bar", 6000) //Expiring time is optional

//get
const obj = await keyv.get("foo");

//delete
await keyv.delete("foo");

//clear
await keyv.clear();

//disconnect
await memcache.disconnect();
```

## Usage with Namespaces

The namespace lives on the store adapter, which prefixes every key with `namespace::` (the separator is the `namespaceSeparator` option). Because the namespace is held on the adapter, give each namespace its own `KeyvMemcache` instance rather than sharing a single store between multiple `Keyv` instances:

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const keyv1 = new Keyv({ store: new KeyvMemcache('localhost:11211'), namespace: "namespace1" });
const keyv2 = new Keyv({ store: new KeyvMemcache('localhost:11211'), namespace: "namespace2" });

//set
await keyv1.set("foo","bar1", 6000) //Expiring time is optional
await keyv2.set("foo","bar2", 6000) //Expiring time is optional

//get
const obj1 = await keyv1.get("foo"); //will return bar1
const obj2 = await keyv2.get("foo"); //will return bar2

```

You can also set the namespace directly on the store, which is handy when you only need a single namespace:

```js
const memcache = new KeyvMemcache('localhost:11211');
memcache.namespace = "namespace1";
const keyv = new Keyv({ store: memcache });
```

`clear()` on one namespace leaves the others alone. See [How `clear()` Works](#how-clear-works).

## Keys Memcached Can't Store

Memcached only stores keys of up to 250 bytes with no whitespace or control characters. The adapter stores any other key, such as a long URL or a key with a space, under a SHA-256 digest of the namespaced key, `keyv:sha256:<hex>`, so every key works. Keys that Memcached accepts are stored as they are, except a key that already starts with `keyv:sha256:`, or with `keyv:gen:`, the prefix of the [generation keys](#how-clear-works). It's hashed too, so it can't overwrite the entry of the key it's the digest of or a generation token.

The 250-byte limit is the client's `maxKeySize` option. If you set it below the 76 characters a digest key takes, the digest is shortened to fit, keeping at least 128 bits. That takes a `maxKeySize` of at least 44. Below that, keys that need hashing fail with the client's key-length error.

```js
const keyv = new Keyv({ store: new KeyvMemcache('localhost:11211') });
await keyv.set('user name', 'a key with a space');
await keyv.set(`https://example.com/search?${'q=keyv&'.repeat(50)}`, 'a key over 250 bytes');
```

## How `clear()` Works

Memcached can't list keys or delete them by prefix, so the adapter clears by generation. Each namespace has a random token, stored under `keyv:gen:` and a digest of the namespace, and every value is stored after the token it was written under. `clear()` writes a new token. Values under an old token read as missing, and Memcached evicts them or lets them expire. Other namespaces, and keys other clients wrote, are left alone.

```js
const sessions = new Keyv({ store: new KeyvMemcache('localhost:11211'), namespace: 'sessions' });
const cache = new Keyv({ store: new KeyvMemcache('localhost:11211'), namespace: 'cache' });
await sessions.set('user', 'alice');
await cache.set('page', '<html>');

await cache.clear();
await cache.get('page'); // undefined
await sessions.get('user'); // 'alice'
```

Without a namespace, `clear()` removes only the entries written without one. To flush the whole server instead, as v5 did, set `noNamespaceAffectsAll: true`. A store without a namespace then also stores values as given, without a token. A store with a namespace always clears only that namespace.

Every store reads the current token when it reads or writes, so a `clear()` in one process takes effect for all of them. What it costs:

- Each read fetches the token in the same multi-get as the values, and each write reads it alongside. Each value takes 17 more bytes: the token and a `:`.
- Cleared values take memory until they expire or Memcached evicts them.
- If the token is lost, because Memcached evicted it or the node holding it restarted, the adapter creates a new one and the namespace reads as empty. It never serves values from before a `clear()`. With several nodes, restarting the node that holds a namespace's token empties that namespace on every node.
- `delete()` returns `true` for a cleared value that Memcached still holds.
- A value without a token, such as one v5 or an earlier v6 release wrote, reads as missing.

## Options

The `KeyvMemcacheOptions` type extends `MemcacheOptions` from the `memcache` package with `namespace`, `namespaceSeparator`, and `noNamespaceAffectsAll` properties:

| Option | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | `undefined` | Key prefix for namespace isolation |
| `namespaceSeparator` | `string` | `'::'` | Separator placed between the namespace and key |
| `noNamespaceAffectsAll` | `boolean` | `false` | Without a namespace, flush the whole server on `clear()` and store values without a token. See [How `clear()` Works](#how-clear-works) |
| `nodes` | `(string \| MemcacheNode)[]` | `['localhost:11211']` | Array of memcache server URIs or MemcacheNode instances |
| `timeout` | `number` | `5000` | Operation timeout in milliseconds |
| `keepAlive` | `boolean` | `true` | Keep the connection alive |
| `keepAliveDelay` | `number` | `1000` | Keep-alive delay in milliseconds |
| `retries` | `number` | `0` | Number of retry attempts for failed commands (0 to disable) |
| `retryDelay` | `number` | `100` | Base delay in milliseconds between retries |
| `retryBackoff` | `function` | fixed delay | Function to calculate backoff delay between retries |
| `retryOnlyIdempotent` | `boolean` | `true` | Only retry idempotent commands to prevent double-execution |
| `sasl` | `{ username, password, mechanism? }` | `undefined` | SASL PLAIN authentication credentials |
| `autoDiscover` | `AutoDiscoverOptions` | `undefined` | AWS ElastiCache Auto Discovery configuration |

```js
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache({
  nodes: ['server1:11211', 'server2:11211'],
  timeout: 3000,
  retries: 2,
  retryDelay: 200,
});
```

## Multiple Nodes

The adapter supports connecting to multiple memcache servers. Keys are distributed across nodes using consistent hashing (KetamaHash):

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache({
  nodes: ['server1:11211', 'server2:11211', 'server3:11211'],
});
const keyv = new Keyv({ store: memcache });
```

Node URIs support multiple formats:
- Simple: `localhost:11211`
- With protocol: `memcache://localhost:11211`
- IPv6: `[::1]:11211`

## SASL Authentication

To connect to a memcache server that requires SASL authentication:

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache({
  nodes: ['localhost:11211'],
  sasl: {
    username: 'myuser',
    password: 'mypassword',
  },
});
const keyv = new Keyv({ store: memcache });
```

## AWS ElastiCache Auto Discovery

When using AWS ElastiCache, you can enable auto discovery to automatically detect cluster topology changes:

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache({
  nodes: ['my-cluster.cfg.use1.cache.amazonaws.com:11211'],
  autoDiscover: {
    enabled: true,
    pollingInterval: 60000, // poll every 60 seconds (default)
  },
});
const keyv = new Keyv({ store: memcache });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | — | Enable auto discovery |
| `pollingInterval` | `number` | `60000` | How often to poll for topology changes (ms) |
| `configEndpoint` | `string` | first node | The `.cfg` endpoint for discovery |
| `useLegacyCommand` | `boolean` | `false` | Use legacy command for engine versions < 1.4.14 |

## API

### constructor(uri?, options?)

Creates a new `KeyvMemcache` instance.

- `uri` — A memcache server URI string (e.g., `'localhost:11211'`) or a `KeyvMemcacheOptions` object. Defaults to `'localhost:11211'` if not provided.
- `options` — Optional `KeyvMemcacheOptions` object. When both `uri` and `options` are objects, they are merged together.

The `namespace` property is extracted from the resolved options and used for key prefixing. All remaining options are passed directly to the underlying `Memcache` client.

```js
import KeyvMemcache from '@keyv/memcache';

// Using a URI string
const memcache = new KeyvMemcache('localhost:11211');

// Using an options object
const memcache2 = new KeyvMemcache({ nodes: ['localhost:11211'], timeout: 3000 });

// Using multiple nodes
const memcache3 = new KeyvMemcache({
  nodes: ['server1:11211', 'server2:11211', 'server3:11211'],
  namespace: 'myapp',
});

// Using a URI string with additional options
const memcache4 = new KeyvMemcache('localhost:11211', { namespace: 'myapp' });
```

### .get(key)

Retrieves a value from the memcache server. Returns the stored value, or `undefined` if the key does not exist or has expired.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar');
const result = await memcache.get('foo'); // 'bar'
```

### .getMany(keys)

Retrieves multiple values from the memcache server. Returns an array of values corresponding to each key, with `undefined` for any key that does not exist.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('key1', 'value1');
await memcache.set('key2', 'value2');
const results = await memcache.getMany(['key1', 'key2', 'key3']); // ['value1', 'value2', undefined]
```

### .set(key, value, expires?)

Stores a value in the memcache server. The optional `expires` parameter is an absolute Unix timestamp in milliseconds (`Date.now() + ttl`). It is converted to Memcached's `exptime` in seconds internally. Through a `Keyv` instance, `keyv.set(key, value, ttl)` still takes a relative `ttl` in milliseconds, and Keyv converts it to `expires` for you. Returns `true` when the value was stored. When Memcached doesn't store it, for example a value over Memcached's item size limit, it returns `false` and emits an error.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar'); // no expiration
await memcache.set('foo', 'bar', Date.now() + 5000); // expires in 5 seconds
```

### .setMany(entries)

Stores multiple values in the memcache server. Each entry is a `KeyvStorageEntry<Value>` object (`{ key: string, value: Value, expires?: number }`), where `expires` is an absolute Unix timestamp in milliseconds and `Value` is inferred from the entries provided. Returns a `boolean[]` indicating whether each entry was set successfully.

```js
const memcache = new KeyvMemcache('localhost:11211');
const results = await memcache.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', expires: Date.now() + 5000 },
]); // [true, true]
```

### .delete(key)

Deletes a key from the memcache server. Returns `true` if the key was deleted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar');
const deleted = await memcache.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from the memcache server. Returns a `boolean[]` indicating whether each key was deleted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('key1', 'value1');
await memcache.set('key2', 'value2');
const results = await memcache.deleteMany(['key1', 'key2']); // [true, true]
```

### .clear()

Removes the entries the store wrote under its namespace by writing a new generation token, and leaves other namespaces and keys other clients wrote alone. See [How `clear()` Works](#how-clear-works). Without a namespace and with `noNamespaceAffectsAll: true`, it flushes the whole server instead. If Memcached doesn't store the new token or doesn't flush, an error is emitted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.clear();
```

### .has(key)

Checks whether a key exists in the memcache server. A cleared value doesn't count. Returns `false` on an error, which is emitted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar');
const exists = await memcache.has('foo'); // true
const missing = await memcache.has('baz'); // false
```

### .hasMany(keys)

Checks whether multiple keys exist in the memcache server. Returns an array of booleans corresponding to each key.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('key1', 'value1');
await memcache.set('key2', 'value2');
const results = await memcache.hasMany(['key1', 'key2', 'key3']); // [true, true, false]
```

### .disconnect()

Gracefully disconnects from the memcache server.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.disconnect();
```

### .formatKey(key)

Formats a key by prepending the namespace and `namespaceSeparator` if a namespace is set. A key Memcached can't store, one over 250 bytes or with whitespace or control characters, is formatted as a SHA-256 digest of the namespaced key instead, and so is a key that starts with `keyv:sha256:` or `keyv:gen:`. See [Keys Memcached Can't Store](#keys-memcached-cant-store).

```js
const memcache = new KeyvMemcache('localhost:11211');
memcache.formatKey('foo'); // 'foo'

memcache.namespace = 'myapp';
memcache.formatKey('foo'); // 'myapp::foo'
memcache.formatKey('user name'); // 'keyv:sha256:…'
```

### Properties

The following public properties are available on a `KeyvMemcache` instance:

| Property | Type | Description |
|---|---|---|
| `client` | `Memcache` | The underlying [memcache](https://github.com/jaredwray/memcache) client instance for advanced use. |
| `namespace` | `string \| undefined` | The namespace used to prefix keys. Can be read and set directly. |
| `namespaceSeparator` | `string` | The separator placed between the namespace and key, `'::'` by default. Can be read and set directly. |
| `noNamespaceAffectsAll` | `boolean` | Without a namespace, whether `clear()` flushes the whole server. Can be read and set directly. |
| `generationKey` | `string` | The key that holds the current namespace's generation token (read-only). |
| `nodes` | `(string \| MemcacheNode)[]` | The configured memcache nodes (read-only). |
| `timeout` | `number \| undefined` | The configured operation timeout in milliseconds (read-only). |
| `keepAlive` | `boolean \| undefined` | The configured keep-alive setting (read-only). |
| `retries` | `number \| undefined` | The configured number of retry attempts (read-only). |
| `retryDelay` | `number \| undefined` | The configured base retry delay in milliseconds (read-only). |

## Works with Memcached and Google Cloud

### Using Memcached

1. Install Memcached and start an instance
```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

//set the server to the correct address and port
const memcache = new KeyvMemcache("localhost:11211");
const keyv = new Keyv({ store: memcache});
```

### Using Google Cloud

1. Go to https://cloud.google.com/ and sign up.
2. Go to the memcached configuration page in the google cloud console by navigating to Memorystore > Memcached.
3. On the memcached page (Eg. https://console.cloud.google.com/memorystore/memcached/instances?project=example), Click Create Instance
4. Fill in all mandatory fields as needed. You will need to set up a private service connection.
5. To set up a private service connection, click the Set Up Connection button.
6. Once required fields are complete, click the Create button to create the instance.
7. Google provides further documentation for connecting to and managing your Memcached instance [here](https://cloud.google.com/memorystore/docs/memcached).

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache("insert the internal google memcached discovery endpoint");
const keyv = new Keyv({ store: memcache});

```


# Breaking Changes from v2 to v6

## Underlying Client Changed from `memjs` to `memcache`

The underlying memcache client has been replaced from [memjs](https://github.com/alevy/memjs) to [memcache](https://github.com/jaredwray/memcache). This brings a fully Promise-based API, built-in TypeScript types, and removes the need for the `buffer` dependency.

## `client` Property Type Changed

The `client` property on `KeyvMemcache` is now an instance of `Memcache` from the `memcache` package instead of `memjs.Client`. If you were accessing `client` directly, you will need to update your code to use the new API.

## `KeyvMemcacheOptions` Type Changed

The options type no longer extends `memjs.ClientOptions`. It now extends `MemcacheOptions` from the `memcache` package. Options such as `logger`, `username`, `password` passed directly are no longer supported. Use the `memcache` package options format instead:

```js
// Before (v2)
const memcache = new KeyvMemcache('user:pass@localhost:11211', { logger: { log: console.log } });

// After (v6)
const memcache = new KeyvMemcache('localhost:11211', { sasl: { username: 'user', password: 'pass' } });
```

## `disconnect()` Method Added

A new `disconnect()` method is available to gracefully close the connection to the memcache server:

```js
await memcache.disconnect();
```

## `buffer` Dependency Removed

The `buffer` polyfill dependency has been removed. Values are now handled as strings instead of Buffers.

## `set` Takes an Absolute `expires`

The third argument of the adapter's `set` is now an absolute Unix timestamp in milliseconds, not a relative `ttl`. This only affects code that calls the adapter directly. `keyv.set(key, value, ttl)` still takes a relative `ttl`.

```js
// Before (v2)
await memcache.set('foo', 'bar', 5000);

// After (v6)
await memcache.set('foo', 'bar', Date.now() + 5000);
```

## `clear()` Only Removes the Store's Own Entries

In v2, `clear()` flushed the whole Memcached server, with or without a namespace, which removed other namespaces' entries and keys other clients wrote. In v6 it removes only the store's own entries by writing a new generation token; see [How `clear()` Works](#how-clear-works).

Values v2 wrote have no token, so v6 reads them as missing, and the cache fills again. To flush the whole server from a store without a namespace, set `noNamespaceAffectsAll: true`.

## License

[MIT © Jared Wray](LICENSE)
