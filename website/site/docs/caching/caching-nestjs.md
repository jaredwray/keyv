---
title: 'Utilizing Keyv for Caching in NestJS: A Step-by-Step Guide'
sidebarTitle: 'Caching in Nest.js'
parent: 'Caching'
---

# Utilizing Keyv for Caching in NestJS: A Step-by-Step Guide

Caching is an essential technique to enhance the performance of your application by storing frequently used data temporarily so that it can be quickly retrieved later. In this blog post, we'll explore how to use Keyv, a simple yet powerful key-value store for Node.js, to implement caching in a NestJS application. We will cover the basics of setting up Keyv with NestJS and demonstrate some examples of how to cache data effectively.

## 1. Setting Up the Project
First, let's create a new NestJS project using the Nest CLI:

```bash
$ npm i -g @nestjs/cli
$ nest new nestjs-keyv-cache
$ cd nestjs-keyv-cache
```
## 2. Installing Keyv and its Dependencies

To begin, install Keyv and a storage adapter of your choice. In this example, we'll use Redis:
```bash
$ npm install cacheable @keyv/redis --save
```
## 3. Integrating Keyv with NestJS

Create a new module named 'CacheModule' to manage the Keyv integration:
```bash
$ nest generate module cache
```

Then, update the cache.module.ts file to import and configure Keyv:

```javascript
import { Module } from '@nestjs/common';
import { Cacheable } from 'cacheable';
import { createKeyv } from '@keyv/redis';

@Module({
  providers: [
    {
      provide: 'CACHE_INSTANCE',
      useFactory: () => {
        // If no namespace is set, the default is 'keyv', and keys are prefixed with 'keyv:'.
        const secondary = createKeyv('redis://user:pass@localhost:6379', { namespace: 'keyv' });
        return new Cacheable({ secondary, ttl: '4h' });
      },
    },
  ],
  exports: ['CACHE_INSTANCE'],
})
export class CacheModule {}
```

Don't forget to import the CacheModule in app.module.ts:
```javascript
import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [CacheModule],
})
export class AppModule {}
```

## 4. Creating a Caching Service with Keyv
Now, create a service to manage caching using Keyv:

```bash
$ nest generate service cache
Update the cache.service.ts file with caching methods:
```

```javascript
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CacheService {
  constructor(@Inject('CACHE_INSTANCE') private readonly cache: Cacheable) {}

  async get<T>(key: string): Promise<T> {
    return await this.cache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number | string): Promise<void> {
    await this.cache.set<T>(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cache.delete(key);
  }
}
```

## 5. Implementing Caching in a Sample Controller
Create a sample controller to demonstrate caching usage:

```bash
$ nest generate controller sample
```

Update the sample.controller.ts file to use the caching service:
```javascript
import { Controller, Get } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Controller('sample')
export class SampleController {
  constructor(private readonly cacheService: CacheService) {}

  @Get()
  async getData() {
    const cacheKey = 'sample-data';
    let data = await this.cacheService.get<string>(cacheKey);

    if (!data) {
      // Simulate fetching data from an external API
      data = 'Sample data from external API';
      await this.cacheService.set(cacheKey, data, '1m'); // Cache for 1 minute
    }

    return {
      data,
      source: data === 'Sample data from external API' ? 'API' : 'Cache',
    };
  }
}
```

This SampleController demonstrates how to use the CacheService to cache and retrieve data. When a request is made to the /sample endpoint, the getData() method first checks if the data is available in the cache. If the data is not cached, it simulates fetching data from an external API, caches the data for 1 minute, and then returns the data along with its source (either "API" or "Cache").
