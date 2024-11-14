---
title: 'How to Implement Caching with Fastify'
sidebarTitle: 'Caching with Fastify'
parent: 'Caching'
---

# How to Implement Caching with Fastify

## What is Fastify?
Fastify is a web framework that provides a powerful plugin-based developer experience (inspired by Hapi and Express) with minimal overhead and is one of the fastest frameworks available, serving up to 30k requests per second. It is fully extensible via hooks, plugins, and decorators. Being schema-based, Fastify compiles schemas very efficiently. A TypeScript type declaration file is also maintained to support the growing TypeScript community.

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv via Cacheable

We can use Keyv to implement caching using [Cacheable](https://npmjs.org/package/cacheable) which is a high performance layer 1 / layer 2 caching framework built on Keyv. It supports multiple storage backends and provides a simple, consistent API for caching.

### Example - Add Cache Support Using Fastify

```js
import { Cacheable } from 'cacheable';
import KeyvRedis from '@keyv/redis';
import fastify from 'fastify';

// by default layer 1 cache is in-memory. If you want to add a layer 2 cache, you can use KeyvRedis
const secondary = new KeyvRedis('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' }); // default time to live set to 4 hours

const fastify = fastify();
fastify
  .register(require('@fastify/caching'), {
    cache
  });

fastify.get('/', async (req, reply) => {
  const cachedResponse = await fastify.cache.get('hello');
  if (cachedResponse) {
    return reply.send(cachedResponse);
  }
  const data = { hello: 'world' };

  await fastify.cache.set('hello', data);
  
  reply.send({hello: 'world'})
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err
})

```