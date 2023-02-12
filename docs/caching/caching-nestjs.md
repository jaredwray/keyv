---
title: 'How to Implement Caching with NestJS'
sidebarTitle: 'Caching with NestJS'
parent: 'Caching'
---

# How to Implement Caching with NestJS

## What is NestJS ?
Nest (NestJS) is a complete development kit for building scalable Node.js server-side apps. The Nest framework has a modular architecture that uses progressive Javascript and supports TypeScript. It is very flexible, allowing developers to use other libraries, including the HTTP framework APIs that Nest is built on (e.g., Express and Fastify).

## What is a Cache?
A cache is a short-term, high-speed data storage layer that stores a subset of data, enabling it to be retrieved faster than accessing it from its primary storage location. Caching allows you to reuse previously retrieved data efficiently.

## Caching Support in Keyv
Caching will work in memory by default. However, users can also install a Keyv storage adapter that is initialized with a connection string or any other storage that implements the Map API.

## Extend your own Module with Keyv to Add Cache Support
- Keyv can be easily embedded into other modules to add cache support.
- You should also set a namespace for your module to safely call `.clear()` without clearing unrelated app data.


### Example - Add Cache Support using NestJS
