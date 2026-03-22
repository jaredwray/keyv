# @keyv/serialize [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> JSON-based serializer for [Keyv](https://github.com/jaredwray/keyv) with support for Buffer, BigInt, and special string handling

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/serialize)](https://npmjs.com/package/@keyv/serialize)

`@keyv/serialize` is the default serializer used by [Keyv](https://github.com/jaredwray/keyv/tree/main/core/keyv). It extends standard JSON serialization with support for `Buffer`, `BigInt`, and safe handling of colon-prefixed strings.

## Installation

```bash
npm install @keyv/serialize
```

> **Note:** `keyv` is a peer dependency and must be installed alongside this package.

## Usage

```js
import { KeyvJsonSerializer, jsonSerializer } from '@keyv/serialize';

// Use the default instance
const serialized = jsonSerializer.stringify({ value: 'hello' });
const deserialized = jsonSerializer.parse(serialized);
// { value: 'hello' }

// Or create your own instance
const serializer = new KeyvJsonSerializer();
```

## Supported Types

`@keyv/serialize` handles all standard JSON types plus:

- **Buffer** — serialized as `:base64:<base64-encoded-data>` and restored to `Buffer` on parse
- **BigInt** — serialized as `:bigint:<string-representation>` and restored to `BigInt` on parse
- **Colon-prefixed strings** — strings starting with `:` are escaped with an extra `:` during stringify and unescaped during parse, preventing collisions with the `Buffer` and `BigInt` tags
- **Objects with `toJSON()`** — `toJSON()` is called (e.g., `Date` objects) and the result is processed

```js
import { jsonSerializer } from '@keyv/serialize';

// Buffer support
const buf = Buffer.from('hello world');
const s1 = jsonSerializer.stringify({ data: buf });
const d1 = jsonSerializer.parse(s1);
console.log(Buffer.isBuffer(d1.data)); // true
console.log(d1.data.toString()); // 'hello world'

// BigInt support
const s2 = jsonSerializer.stringify({ value: BigInt('9223372036854775807') });
const d2 = jsonSerializer.parse(s2);
console.log(d2.value === BigInt('9223372036854775807')); // true

// Nested arrays and objects
const s3 = jsonSerializer.stringify({ items: [[1, 2], [3, 4]] });
const d3 = jsonSerializer.parse(s3);
console.log(d3.items); // [[1, 2], [3, 4]]
```

## API

### `KeyvJsonSerializer`

A class that implements the `KeyvSerializationAdapter` interface from `keyv`.

#### `stringify(object: unknown): string`

Converts a value to a JSON string. Before serialization, a `prepare()` step walks the value tree to:
- Convert `Buffer` instances to `:base64:` tagged strings
- Convert `BigInt` values to `:bigint:` tagged strings
- Escape strings starting with `:` by prepending an additional `:`
- Call `toJSON()` on objects that define it
- Skip `undefined` properties

#### `parse<T>(data: string): T`

Parses a JSON string back into its original value. Uses a reviver function that:
- Restores `:bigint:` tagged strings to `BigInt` values
- Restores `:base64:` tagged strings to `Buffer` instances
- Strips the escape `:` from colon-prefixed strings

### `jsonSerializer`

A default `KeyvJsonSerializer` instance, ready to use.

```js
import { jsonSerializer } from '@keyv/serialize';
```

## Custom Serializers

You can create your own serializer by implementing the `KeyvSerializationAdapter` interface from `keyv`:

```typescript
import type { KeyvSerializationAdapter } from 'keyv';

interface KeyvSerializationAdapter {
  stringify: (object: unknown) => string | Promise<string>;
  parse: <T>(data: string) => T | Promise<T>;
}
```

Both `stringify` and `parse` support returning a `Promise` for async serialization use cases.

## License

[MIT © Jared Wray](LICENSE)
