---
title: 'Getting Started Guide'
order: 1
---

# Getting Started Guide

Keyv provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL based expiry, making it suitable as a cache or a persistent key-value store. Follow the steps below to get you up and running.

## 1. Make a Project Directory
Make a directory with your project in it.

```sh
mkdir keyv
cd keyv
```
You’re now inside your project’s directory.

## 2. Install keyv

```sh
npm install --save keyv
```
By default, everything is stored in memory; you can optionally also install a storage adapter; choose one from the following:

```sh
npm install --save @keyv/redis
npm install --save @keyv/valkey
npm install --save @keyv/memcache
npm install --save @keyv/mongo
npm install --save @keyv/sqlite
npm install --save @keyv/postgres
npm install --save @keyv/mysql
npm install --save @keyv/etcd
```

> **Note**: You can also use third-party storage adapters

The following are third-party storage adapters compatible with Keyv:
- [@resolid/keyv-sqlite](https://github.com/huijiewei/keyv-sqlite) - A new SQLite storage adapter for Keyv
- [keyv-arango](https://github.com/TimMikeladze/keyv-arango) - ArangoDB storage adapter for Keyv
- [keyv-azuretable](https://github.com/howlowck/keyv-azuretable) - Azure Table Storage/API adapter for Keyv
- [keyv-browser](https://github.com/zaaack/keyv-browser) - Browser storage adapter for Keyv, including localStorage and indexedDB.
- [keyv-dynamodb](https://www.npmjs.com/package/keyv-dynamodb) - DynamoDB storage adapter for Keyv
- [keyv-file](https://github.com/zaaack/keyv-file) - File system storage adapter for Keyv
- [keyv-firestore ](https://github.com/goto-bus-stop/keyv-firestore) – Firebase Cloud Firestore adapter for Keyv
- [keyv-lru](https://www.npmjs.com/package/keyv-lru) - LRU storage adapter for Keyv
- [keyv-momento](https://github.com/momentohq/node-keyv-adaptor/) - Momento storage adapter for Keyv
- [keyv-mssql](https://github.com/pmorgan3/keyv-mssql) - Microsoft Sql Server adapter for Keyv
- [keyv-null](https://www.npmjs.com/package/keyv-null) - Null storage adapter for Keyv
- [keyv-upstash](https://github.com/mahdavipanah/keyv-upstash) - Upstash Redis adapter for Keyv
- [quick-lru](https://github.com/sindresorhus/quick-lru) - Simple "Least Recently Used" (LRU) cache


## 3. Create a New Keyv Instance
Pass your connection string if applicable. Keyv will automatically load the correct storage adapter. ////
```js
// example Keyv instance that uses sqlite storage adapter
const keyv = new Keyv('sqlite://path/to/database.sqlite');
```


`Keyv` Parameters

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
uri | String | N | The connection string URI. Merged into the options object as options.uri. Default value: undefined
options | Object | N | The options object is also passed through to the storage adapter. See the table below for a list of available options.

`options` Parameters

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
namespace | String | N | Namespace for the current instance.  Default: 'keyv'
ttl | Number | N | This is the default TTL, it can be overridden by specifying a TTL on .set().  Default: undefined
compression | @keyv/compress\-\<compression_package_name> | N | Compression package to use. See Compression for more details. Default: undefined.
serialize | Function | N | A custom serialization function. Default: JSONB.stringify
deserialize | Function | N | A custom deserialization function. Default: JSONB.parse
store | Storage adapter instance | N | The storage adapter instance to be used by Keyv. Default: new Map()
adapter | String | N | Specify an adapter to use. e.g 'redis' or 'mongodb'. Default: undefined

### Example - Create an Instance of Keyv with a connection URI
The following example shows how you would create and Instance of Keyv with a `mongodb` connection URI.

```js
const Keyv = require('keyv');

const keyv = new Keyv('mongodb://user:pass@localhost:27017/dbname');

// Handle DB connection errors
keyv.on('error', err => console.log('Connection Error', err));
```
### Example - Create an Instance of Keyv using a third-party storage adapter

[`quick-lru`](https://github.com/sindresorhus/quick-lru) is a third-party module that implements the Map API.

```js
const Keyv = require('keyv');
const QuickLRU = require('quick-lru');

const lru = new QuickLRU({ maxSize: 1000 });
const keyv = new Keyv({ store: lru });

// Handle DB connection errors
keyv.on('error', err => console.log('Connection Error', err));
```

## 4. Create Some Key Value Pairs

Method: `set(key, value, [ttl])` - Set a value for a specified key.

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
key | String | Y | Unique identifier which is used to look up the value. Keys are persistent by default.
value | Any  | Y | Data value associated with the key
ttl | Number | N | Expiry time in milliseconds

The following example code shows you how to create a key-value pair using the `set` method.

```js

const keyv = new Keyv('redis://user:pass@localhost:6379');

// set a key value pair that expires in 1000 milliseconds
await keyv.set('foo', 'expires in 1 second', 1000); // true

// set a key value pair that never expires
await keyv.set('bar', 'never expires'); // true
```



Method: `delete(key)` - Deletes an entry.

Parameter | Type | Required | Description
------------ | ------------- | ------------- | -------------
key | String | Y | Unique identifier which is used to look up the value. Returns `true `if the key existed, `false` if not.

To delete a key value pair use the `delete(key)` method as shown below:

```js
// Delete the key value pair for the 'foo' key
await keyv.delete('foo'); // true
```


## 5. Advanced - Use Namespaces to Avoid Key Collisions
You can namespace your Keyv instance to avoid key collisions and allow you to clear only a certain namespace while using the same database.

The example code below creates two namespaces, 'users' and 'cache' and creates a key value pair using the key 'foo' in both namespaces, it also shows how to delete all values in a specified namespace.

```js
const users = new Keyv('redis://user:pass@localhost:6379', { namespace: 'users' });
const cache = new Keyv('redis://user:pass@localhost:6379', { namespace: 'cache' });

// Set a key-value pair using the key 'foo' in both namespaces
await users.set('foo', 'users'); // returns true
await cache.set('foo', 'cache'); // returns true

// Retrieve a Value
await users.get('foo'); // returns 'users'
await cache.get('foo'); // returns 'cache'

// Delete all values for the specified namespace
await users.clear();
```

## 6. Advanced - Enable Compression

Keyv supports both `gzip`, `brotli` and `lz4` methods of compression. Before you can enable compression, you will need to install the compression package:

```sh
npm install --save keyv @keyv/compress-gzip
```

### Example - Enable Gzip compression
To enable compression, pass the `compression` option to the constructor.

```js
const KeyvGzip = require('@keyv/compress-gzip');
const Keyv = require('keyv');

const keyvGzip = new KeyvGzip();
const keyv = new Keyv({ compression: KeyvGzip });
```

### Example - Enable Brotli compression

```js
import Keyv from 'keyv';
import KeyvBrotli from '@keyv/compress-brotli';

const keyvBrotli = new KeyvBrotli();
const keyv = new Keyv({ compression: keyvBrotli });
```

### Example - Enable lz4 compression

```js
import Keyv from 'keyv';
import KeyvLz4 from '@keyv/compress-lz4';

const keyvLz4 = new KeyvLz4();
const keyv = new Keyv({ compression: keyvLz4 });
```

You can also pass a custom compression function to the compression option. Custom compression functions must follow the pattern of the official compression adapter (see below for further information).

### Want to build your own?

Great! Keyv is designed to be easily extended. You can build your own compression adapter by following the pattern of the official compression adapters based on this interface:

```js
interface CompressionAdapter {
	async compress(value: any, options?: any);
	async decompress(value: any, options?: any);
	async serialize(value: any);
	async deserialize(value: any);
}
```

#### Test your custom compression adapter
In addition to the interface, you can test it with our compression test suite using `@keyv/test-suite`:

```js
const {keyvCompresstionTests} = require('@keyv/test-suite');
const KeyvGzip = require('@keyv/compress-gzip');

keyvCompresstionTests(test, new KeyvGzip());
```

## 7. Advanced - Extend your own Module with Keyv
Keyv can be easily embedded into other modules to add cache support.
- Caching will work in memory by default, and users can also install a Keyv storage adapter and pass in a connection string or any other storage that implements the Map API.
- You should also set a namespace for your module to safely call `.clear()` without clearing unrelated app data.

>**Note**:
> The recommended pattern is to expose a cache option in your module's options which is passed through to Keyv.

### Example - Add Cache Support to a Module

1. Install whichever storage adapter you will be using, `keyv-redis` in this example
```sh
npm install --save keyv-redis
```
2. Declare the Module with the cache controlled by a Keyv instance
```js
class AwesomeModule {
	constructor(opts) {
		this.cache = new Keyv({
			uri: typeof opts.cache === 'string' && opts.cache,
			store: typeof opts.cache !== 'string' && opts.cache,
			namespace: 'awesome-module'  
		});
	}
}
```

3. Create an Instance of the Module with caching support
```js
const AwesomeModule = require('awesome-module');
const awesomeModule = new AwesomeModule({ cache: 'redis://localhost' });
```
