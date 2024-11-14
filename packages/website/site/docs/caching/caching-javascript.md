---
title: 'How to Implement Caching in Javascript'
sidebarTitle: 'Caching in Javascript'
parent: 'Caching'
---

# How to Implement Caching in Javascript

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv
Caching will work in memory by default. However, users can also install a Keyv storage adapter that is initialized with a connection string or any other storage that implements the Map API.

## Caching Support in Keyv via Cacheable

We can use Keyv to implement caching using [Cacheable](https://npmjs.org/package/cacheable) which is a high performance layer 1 / layer 2 caching framework built on Keyv. It supports multiple storage backends and provides a simple, consistent API for caching.



### Example - Add Cache Support to a Module

1. Install whichever storage adapter you will be using, `@keyv/redis` in this example
```sh
npm install --save @keyv/redis cacheable
```
2. Declare the Module with the cache controlled by a Keyv instance
```js
import { Cacheable } from 'cacheable';
import KeyvRedis from '@keyv/redis';

// by default layer 1 cache is in-memory. If you want to add a layer 2 cache, you can use KeyvRedis
const secondary = new KeyvRedis('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' }); // default time to live set to 4 hours
```
