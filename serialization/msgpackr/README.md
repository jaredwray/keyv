# @keyv/serialize-msgpackr [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> High-performance MessagePack serializer for [Keyv](https://github.com/jaredwray/keyv) using [msgpackr](https://github.com/kriszyp/msgpackr)

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/serialize-msgpackr)](https://npmjs.com/package/@keyv/serialize-msgpackr)

`@keyv/serialize-msgpackr` is a serialization adapter for [Keyv](https://github.com/jaredwray/keyv/tree/main/core/keyv) powered by [msgpackr](https://github.com/kriszyp/msgpackr). It uses the MessagePack binary format for high-performance serialization with rich type support.

## Supported Types

In addition to all standard JSON types, msgpackr supports:

- `Date`
- `RegExp`
- `Map`
- `Set`
- `Error`
- `undefined`
- `NaN`, `Infinity`, `-Infinity`

Binary data is base64-encoded for compatibility with string-based storage adapters.

## Installation

```bash
npm install @keyv/serialize-msgpackr
```

> **Note:** `keyv` is a peer dependency and must be installed alongside this package.

## Usage

```js
import Keyv from 'keyv';
import { msgpackrSerializer } from '@keyv/serialize-msgpackr';

const keyv = new Keyv({ serialization: msgpackrSerializer });

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

### `KeyvMsgpackrSerializer`

A class that implements the `KeyvSerializationAdapter` interface from `keyv`.

```js
import { KeyvMsgpackrSerializer } from '@keyv/serialize-msgpackr';

const serializer = new KeyvMsgpackrSerializer();
```

#### `stringify(object: unknown): string`

Serializes a value to a base64-encoded MessagePack string using msgpackr.

#### `parse<T>(data: string): T`

Deserializes a base64-encoded MessagePack string back to its original value with all types restored.

### `msgpackrSerializer`

A default `KeyvMsgpackrSerializer` instance, ready to use.

```js
import { msgpackrSerializer } from '@keyv/serialize-msgpackr';
```

## License

[MIT © Jared Wray](LICENSE)
