---
title: 'How to Implement Caching with Express'
sidebarTitle: 'Caching with Express'
parent: 'Caching'
---

# How to Implement Caching with Express

## What is Express?
Express is a minimal Node.js web application framework. Its APIs provide web and mobile application functionality. Its simplicity enables users to quickly create a robust API in a familiar environment with enhanced features, including Robust routing, high performance, HTTP helpers, support for 14+ view template engines, content negotiation, and an executable for generating applications quickly.

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv via Cacheable

We can use Keyv to implement caching using [Cacheable](https://npmjs.org/package/cacheable) which is a high performance layer 1 / layer 2 caching framework built on Keyv. It supports multiple storage backends and provides a simple, consistent API for caching.

### Example - Add Cache Support for Express

```js
import express from 'express';
import { Cacheable } from 'cacheable';
import { createKeyv } from '@keyv/redis';

const secondary = createKeyv('redis://user:pass@localhost:6379');
const cache = new Cacheable({ secondary, ttl: '4h' });

const app = express();

app.get('/test-cache/:id', async (req, res) => {
    if(!req.params.id) return res.status(400).send('Missing id param');
    const id = req.params.id;
    const cached = await cache.get(id);
    if(cached) {
        return res.send(cached);
    } else {
        const data = await getData(id);
        await cache.set(id, data);
        return res.send(data);
    }
});

```
