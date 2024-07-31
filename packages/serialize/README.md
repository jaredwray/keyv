# @keyv/serialize [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Serialization functionality for [Keyv](https://github.com/jaredwray/keyv)


[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv)](https://github.com/jaredwray/keyv/blob/master/LICENSE)
[![npm](https://img.shields.io/npm/dm/@keyv/memcache)](https://npmjs.com/package/@keyv/memcache)

This is a serialization package for `Keyv` and is based on `node:buffer` serialization. It is used to serialize and deserialize data for storage in `Keyv` storage adapters. To use your own serialization you can do the following:

```javascript
import Keyv from 'keyv';
const keyv = new Keyv({ serialize: JSON.stringify, deserialize: JSON.parse });
```

Pass in your own serialization functions to the `Keyv` constructor. The `serialize` function should return a string and the `deserialize` function should return an object.

## Warning: Using custom serializers means you lose any guarantee of data consistency. You should do extensive testing with your serialisation functions and chosen storage engine.



## License

[MIT © Jared Wray](LICENSE)