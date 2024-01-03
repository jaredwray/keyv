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

## Caching Support in Keyv
Caching will work in memory by default. However, users can also install a Keyv storage adapter that is initialized with a connection string or any other storage that implements the Map API.

### Example - Add Cache Support Using Koa

```js
import keyv from 'keyv';

// ...
const cache = new Keyv();
const cacheTTL = 1000 * 60 * 60 * 24; // 24 hours

app.use(async ctx => {
    // this response is already cashed if `true` is returned,
    // so this middleware will automatically serve this response from cache
    if (await keyv.get(ctx.url)) {
        return keyv.get(ctx.url);
    }

    // set the response body here
    ctx.body = 'hello world!';
    // cache the response
    await keyv.set(ctx.url, ctx.body. cacheTTL);
});
```