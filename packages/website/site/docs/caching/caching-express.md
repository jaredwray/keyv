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

## Caching Support in Keyv
Caching will work in memory by default. However, users can also install a Keyv storage adapter that is initialized with a connection string or any other storage that implements the Map API.

### Example - Add Cache Support Using Express

```js
const express = require('express');
const Keyv = require('keyv');

const keyv = new Keyv();

const app = express();

const ttl = 1000 * 60 * 60 * 24; // 24 hours

app.get('/test-cache/:id', async (req, res) => {
    if(!req.params.id) return res.status(400).send('Missing id param');
    const id = req.params.id;
    const cached = await keyv.get(id);
    if(cached) {
        return res.send(cached);
    } else {
        const data = await getData(id);
        await keyv.set(id, data, ttl);
        return res.send(data);
    }
});

```
