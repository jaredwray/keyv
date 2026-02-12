---
title: 'How to Implement Caching with Koa'
sidebarTitle: 'Caching with Koa'
parent: 'Caching'
---

# How to Implement Caching with Koa

## What is Koa?
Koa is a web framework from the team behind Express that offers a smaller, more expressive, more robust foundation for APIs and web applications. Koa's use of async functions removes the need for callbacks and increases error handling. A Koa Context combines a node request and response object into a single object providing numerous helpful methods for writing APIs and web apps.

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv via Cacheable

We can use Keyv to implement caching using [Cacheable](https://npmjs.org/package/cacheable) which is a high performance layer 1 / layer 2 caching framework built on Keyv. It supports multiple storage backends and provides a simple, consistent API for caching.

### Example - Add Cache Support Using Koa

```js
import Koa from 'koa';
import { Cacheable } from 'cacheable';
import KeyvRedis from '@keyv/redis';

// by default layer 1 cache is in-memory. If you want to add a layer 2 cache, you can use KeyvRedis
const secondary = new KeyvRedis('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' }); // default time to live set to 4 hours

const app = new Koa();

app.use(async ctx => {
    // this response is already cashed if `true` is returned,
    // so this middleware will automatically serve this response from cache
    if (await cache.get(ctx.url)) {
        return cache.get(ctx.url);
    }

    // set the response body here
    ctx.body = 'hello world!';
    // cache the response
    await cache.set(ctx.url, ctx.body. cacheTTL);
});
```