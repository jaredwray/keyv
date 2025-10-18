# @keyv/redis [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Bigmap for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/redis.svg)](https://www.npmjs.com/package/@keyv/redis)
[![npm](https://img.shields.io/npm/dm/@keyv/redis)](https://npmjs.com/package/@keyv/redis)

# Features
* Based on the Map interface and uses the same API.
* Lightweight with no dependencies.
* Scales to past the 17 million key limit of a regular Map.
* Uses a hash `djb2Hash` for fast key lookups.
* Ability to use your own hash function.
* Built in Typescript and Generics for type safety.
* Used in `@cacheable/memory` for scalable in-memory caching.
* Maintained regularly with a focus on performance and reliability.

# Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Usage](#basic-usage)
  - [Configuration Options](#configuration-options)
    - [Custom Store Size](#custom-store-size)
    - [Custom Hash Function](#custom-hash-function)
  - [Iteration](#iteration)
    - [For...of Loop](#forof-loop)
    - [forEach](#foreach)
    - [Keys, Values, and Entries](#keys-values-and-entries)
  - [Advanced Features](#advanced-features)
    - [Type Safety with Generics](#type-safety-with-generics)
    - [Large-Scale Data](#large-scale-data)
- [Contributing](#contributing)
- [License](#license)

# Installation

```bash
npm install --save keyv @keyv/bigmap
```

# Usage

BigMap is a scalable Map implementation that overcomes JavaScript's built-in Map limit of approximately 17 million entries. It uses a distributed hash approach with multiple internal Map instances.

## Basic Usage

```typescript
import { BigMap } from '@keyv/bigmap';

// Create a new BigMap
const bigMap = new BigMap<string, number>();

// Set values
bigMap.set('key1', 100);
bigMap.set('key2', 200);

// Get values
const value = bigMap.get('key1'); // 100

// Check if key exists
bigMap.has('key1'); // true

// Delete a key
bigMap.delete('key1'); // true

// Get size
console.log(bigMap.size); // 1

// Clear all entries
bigMap.clear();
```

## Configuration Options

### Custom Store Size

By default, BigMap uses 4 internal Map instances. You can configure this:

```typescript
const bigMap = new BigMap<string, number>({ storeSize: 10 });
```

**Note:** Changing the `storeSize` after initialization will clear all entries.

### Custom Hash Function

Provide your own hash function for key distribution:

```typescript
const customHashFunction = (key: string, storeSize: number) => {
  return key.length % storeSize;
};

const bigMap = new BigMap<string, string>({
  storeHashFunction: customHashFunction
});
```

## Iteration

BigMap supports all standard Map iteration methods:

### For...of Loop

```typescript
const bigMap = new BigMap<string, number>();
bigMap.set('a', 1);
bigMap.set('b', 2);

for (const [key, value] of bigMap) {
  console.log(key, value);
}
```

### forEach

```typescript
bigMap.forEach((value, key) => {
  console.log(key, value);
});

// With custom context
const context = { sum: 0 };
bigMap.forEach(function(value) {
  this.sum += value;
}, context);
```

### Keys, Values, and Entries

```typescript
// Iterate over keys
for (const key of bigMap.keys()) {
  console.log(key);
}

// Iterate over values
for (const value of bigMap.values()) {
  console.log(value);
}

// Iterate over entries
for (const [key, value] of bigMap.entries()) {
  console.log(key, value);
}
```

## Advanced Features

### Type Safety with Generics

```typescript
interface User {
  id: number;
  name: string;
}

const userMap = new BigMap<string, User>();
userMap.set('user1', { id: 1, name: 'Alice' });
```

### Large-Scale Data

BigMap is designed to handle millions of entries:

```typescript
const bigMap = new BigMap<string, number>({ storeSize: 16 });

// Add 20+ million entries without hitting Map limits
for (let i = 0; i < 20000000; i++) {
  bigMap.set(`key${i}`, i);
}

console.log(bigMap.size); // 20000000
```

# Contributing

Please see our [contributing](https://github.com/jaredwray/keyv/blob/main/CONTRIBUTING.md) guide.

# License

[MIT © Jared Wray](LICENSE)
