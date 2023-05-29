---
title: 'Utilizing Keyv for Caching in Node.js: A Step-by-Step Guide'
sidebarTitle: 'Caching in Node.js'
parent: 'Caching'
---

# Utilizing Keyv for Caching in Node.js: A Step-by-Step Guide

## 1. Setting up the Project
To start a new Node.js project, you first need to create a new directory for your project and then initialize a new Node.js project in that directory.

```bash
mkdir keyv-cache-demo
cd keyv-cache-demo
npm init -y
```
The npm init -y command will create a new package.json file in your project directory with default settings.

## 2. Installing Keyv and its Dependencies
In this step, you'll install Keyv and a Keyv storage adapter for your project. For this example, we'll use SQLite as the storage adapter.

```bash
npm install keyv @keyv/sqlite
```
Keyv supports a variety of storage adapters like Redis, MongoDB, PostgreSQL, etc. Feel free to choose the one that best fits your project requirements.

## 3. Creating a Caching Service Example
In this step, we'll create a simple caching service using Keyv.

Create a new file named cacheService.js in your project directory and add the following code to that file.

```javascript
const Keyv = require('keyv');
const keyv = new Keyv('sqlite://path/to/database.sqlite');

class CacheService {
  async get(key) {
    const value = await keyv.get(key);
    if (value) {
      console.log('Cache hit');
    } else {
      console.log('Cache miss');
    }  
    return value;
  }

  async set(key, value, ttlInMilliseconds) {
    await keyv.set(key, value, ttlInMilliseconds);
  }

  async delete(key) {
    await keyv.delete(key);
  }
}

module.exports = CacheService;
```

In this code:

We're importing the Keyv library and initializing it with an SQLite database.

We're creating a CacheService class with get, set, and delete methods that wrap the corresponding methods of the Keyv instance. The get method includes console logs to indicate whether the requested value was found in the cache.

The set method includes an optional ttlInMilliseconds parameter, which you can use to set a time-to-live (TTL) for the cached value.

Now you have a reusable CacheService that you can use to add caching to your Node.js project.

Here is how you could use the CacheService:

```javascript
const CacheService = require('./cacheService');
const cache = new CacheService();

// Usage
async function fetchData() {
  const key = 'myData';
  let data = await cache.get(key);
  if (!data) {
    data = await getMyData(); // Function that fetches your data
    await cache.set(key, data, 10000); // Cache for 10 seconds
  }
  return data;
}
```

This is a basic example, and Keyv provides a lot of flexibility, so you can modify this service to better suit your project's needs.
