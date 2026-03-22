# @keyv/serialize-superjson [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> SuperJSON-based serializer for [Keyv](https://github.com/jaredwray/keyv) with support for Date, Map, Set, BigInt, RegExp, and more

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/serialize-superjson)](https://npmjs.com/package/@keyv/serialize-superjson)

`@keyv/serialize-superjson` is a serialization adapter for [Keyv](https://github.com/jaredwray/keyv/tree/main/core/keyv) powered by [SuperJSON](https://github.com/flightcontrolhq/superjson). It preserves JavaScript types that standard JSON does not support.

## Supported Types

In addition to all standard JSON types, SuperJSON supports:

- `Date`
- `RegExp`
- `Map`
- `Set`
- `BigInt`
- `undefined`
- `Error`
- `URL`

## Installation

```bash
npm install @keyv/serialize-superjson
```

> **Note:** `keyv` is a peer dependency and must be installed alongside this package.

## Usage

```js
import Keyv from 'keyv';
import { superJsonSerializer } from '@keyv/serialize-superjson';

const keyv = new Keyv({ serialization: superJsonSerializer });

// Store a Date — it comes back as a Date, not a string
await keyv.set('date', new Date('2024-01-15'));
const date = await keyv.get('date');
console.log(date instanceof Date); // true

// Store a Map
await keyv.set('map', new Map([['a', 1], ['b', 2]]));
const map = await keyv.get('map');
console.log(map instanceof Map); // true
console.log(map.get('a')); // 1

// Store a Set
await keyv.set('set', new Set([1, 2, 3]));
const set = await keyv.get('set');
console.log(set instanceof Set); // true
```

## API

### `KeyvSuperJsonSerializer`

A class that implements the `KeyvSerializationAdapter` interface from `keyv`.

```js
import { KeyvSuperJsonSerializer } from '@keyv/serialize-superjson';

const serializer = new KeyvSuperJsonSerializer();
```

#### `stringify(object: unknown): string`

Serializes a value to a JSON string using SuperJSON, preserving type information.

#### `parse<T>(data: string): T`

Deserializes a SuperJSON string back to its original value with all types restored.

### `superJsonSerializer`

A default `KeyvSuperJsonSerializer` instance, ready to use.

```js
import { superJsonSerializer } from '@keyv/serialize-superjson';
```

## License

[MIT © Jared Wray](LICENSE)
