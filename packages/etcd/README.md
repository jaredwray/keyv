# @keyv/etcd [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwra/keyv)

> Etcd storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/etcd.svg)](https://www.npmjs.com/package/@keyv/etcd)

Etcd storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Install

```shell
npm install --save keyv @keyv/etcd
```

## Usage

```js
import Keyv from 'keyv';
import KeyvEtcd from '@keyv/etcd';

const keyv = new Keyv(new KeyvEtcd('etcd://localhost:2379'));
keyv.on('error', handleConnectionError);
```

## License

[MIT © Jared Wray](LICENSE)
