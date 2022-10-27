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
npm install --save @keyv/mongo
npm install --save @keyv/sqlite
npm install --save @keyv/postgres
npm install --save @keyv/mysql
npm install --save @keyv/etcd
```

> **Note**: You can also use third-party storage adapters

The following are third-party storage adapters compatible with Keyv:
- [`quick-lru`](https://github.com/sindresorhus/quick-lru) - Simple "Least Recently Used" (LRU) cache
- [`keyv-file`](https://github.com/zaaack/keyv-file) - File system storage adapter for Keyv
- [`keyv-dynamodb`](https://www.npmjs.com/package/keyv-dynamodb) - DynamoDB storage adapter for Keyv
- [`keyv-lru`](https://www.npmjs.com/package/keyv-lru) - LRU storage adapter for Keyv
- [`keyv-null`](https://www.npmjs.com/package/keyv-null) - Null storage adapter for Keyv
- [`keyv-firestore`](https://github.com/goto-bus-stop/keyv-firestore) – Firebase Cloud Firestore adapter for Keyv
- [`keyv-mssql`](https://github.com/pmorgan3/keyv-mssql) - Microsoft Sql Server adapter for Keyv
- [`keyv-azuretable`](https://github.com/howlowck/keyv-azuretable) - Azure Table Storage/API adapter for Keyv


## 3. Create a New Keyv Instance
Pass your connection string if applicable. Keyv will automatically load the correct storage adapter.

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

`quick-lru` is a third-party module that implements the Map API.

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
