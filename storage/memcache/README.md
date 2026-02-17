# @keyv/memcache [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Memcache storage adapter for [Keyv](https://github.com/jaredwray/keyv) using the [memcache](https://github.com/jaredwray/memcache) client


[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/memcache)](https://npmjs.com/package/@keyv/memcache)

## Table of Contents

- [Install](#install)
- [Keyv Compression is not Supported](#keyv-compression-is-not-supported)
- [Quick Start with createKeyv](#quick-start-with-createkeyv)
- [Usage](#usage)
- [Usage with Namespaces](#usage-with-namespaces)
- [API](#api)
  - [.get(key)](#getkey)
  - [.getMany(keys)](#getmanykeys)
  - [.set(key, value, ttl?)](#setkey-value-ttl)
  - [.setMany(entries)](#setmanyentries)
  - [.delete(key)](#deletekey)
  - [.deleteMany(keys)](#deletemanykeys)
  - [.clear()](#clear)
  - [.has(key)](#haskey)
  - [.hasMany(keys)](#hasmanykeys)
  - [.disconnect()](#disconnect)
  - [.formatKey(key)](#formatkeykey)
- [Works with Memcached and Google Cloud](#works-with-memcached-and-google-cloud)
  - [Using Memcached](#using-memcached)
  - [Using Google Cloud](#using-google-cloud)
- [Breaking Changes from v2 to v6](#breaking-changes-from-v2-to-v6)
  - [Underlying Client Changed from `memjs` to `memcache`](#underlying-client-changed-from-memjs-to-memcache)
  - [`client` Property Type Changed](#client-property-type-changed)
  - [`KeyvMemcacheOptions` Type Changed](#keyvmemcacheoptions-type-changed)
  - [`disconnect()` Method Added](#disconnect-method-added)
  - [`buffer` Dependency Removed](#buffer-dependency-removed)
- [License](#license)

## Install

```shell
npm install --save @keyv/memcache
```

## Keyv Compression is not Supported

This package does not support compression. If you need compression, please use the `@keyv/redis` or another service package instead.

## Quick Start with createKeyv

The `createKeyv` helper creates a `Keyv` instance with a Memcache store in a single call:

```js
import { createKeyv } from '@keyv/memcache';

const keyv = createKeyv('localhost:11211');

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

const keyv = createKeyv({ url: 'localhost:11211' });
```

## Usage

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache('localhost:11211');
const keyv = new Keyv({ store: memcache });

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

```js
import Keyv from 'keyv';
import KeyvMemcache from '@keyv/memcache';

const memcache = new KeyvMemcache('localhost:11211');
const keyv1 = new Keyv({ store: memcache, namespace: "namespace1" });
const keyv2 = new Keyv({ store: memcache, namespace: "namespace2" });

//set
await keyv1.set("foo","bar1", 6000) //Expiring time is optional
await keyv2.set("foo","bar2", 6000) //Expiring time is optional

//get
const obj1 = await keyv1.get("foo"); //will return bar1
const obj2 = await keyv2.get("foo"); //will return bar2

```

## API

### .get(key)

Retrieves a value from the memcache server. Returns the stored data or `undefined` if the key does not exist.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar');
const result = await memcache.get('foo'); // { value: 'bar', expires: ... }
```

### .getMany(keys)

Retrieves multiple values from the memcache server. Returns an array of stored data corresponding to each key.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('key1', 'value1');
await memcache.set('key2', 'value2');
const results = await memcache.getMany(['key1', 'key2']);
```

### .set(key, value, ttl?)

Stores a value in the memcache server. The optional `ttl` parameter is in milliseconds and is converted to seconds internally.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar'); // no expiration
await memcache.set('foo', 'bar', 5000); // expires in 5 seconds
```

### .setMany(entries)

Stores multiple values in the memcache server. Each entry can have an optional `ttl` in milliseconds.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 5000 },
]);
```

### .delete(key)

Deletes a key from the memcache server. Returns `true` if the key was deleted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('foo', 'bar');
const deleted = await memcache.delete('foo'); // true
```

### .deleteMany(keys)

Deletes multiple keys from the memcache server. Returns `true` only if all keys were successfully deleted.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.set('key1', 'value1');
await memcache.set('key2', 'value2');
const allDeleted = await memcache.deleteMany(['key1', 'key2']); // true
```

### .clear()

Flushes all data from the memcache server. Note: this clears the entire server, not just keys within the current namespace.

```js
const memcache = new KeyvMemcache('localhost:11211');
await memcache.clear();
```

### .has(key)

Checks whether a key exists in the memcache server. Returns `false` on any error.

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

Formats a key by prepending the namespace if one is set. If no namespace is set, the key is returned as-is.

```js
const memcache = new KeyvMemcache('localhost:11211');
memcache.formatKey('foo'); // 'foo'

memcache.namespace = 'myapp';
memcache.formatKey('foo'); // 'myapp:foo'
```

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

The options type no longer extends `memjs.ClientOptions`. It now extends `Partial<MemcacheOptions>` from the `memcache` package. Options such as `logger`, `username`, `password` passed directly are no longer supported. Use the `memcache` package options format instead:

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

## License

[MIT © Jared Wray](LISCENCE)
