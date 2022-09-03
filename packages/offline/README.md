# @keyv/offline [<img width="100" align="right" src="https://jaredwray.com/images/keyv.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> offline storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/offline.svg)](https://www.npmjs.com/package/@keyv/offline)
[![npm](https://img.shields.io/npm/dm/@keyv/offline)](https://npmjs.com/package/@keyv/offline)

Offline storage adapter for [Keyv](https://github.com/jaredwray/keyv).

## Install

```shell
npm install --save keyv @keyv/offline
```

## Usage

```js
const Keyv = require('keyv');

const keyv = new Keyv('offline://path/to/database.offline');
keyv.on('error', handleConnectionError);
```

## License

MIT © Jared Wray
