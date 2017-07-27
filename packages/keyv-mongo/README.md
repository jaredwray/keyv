# keyv-mongo

[![Greenkeeper badge](https://badges.greenkeeper.io/lukechilds/keyv-mongo.svg)](https://greenkeeper.io/)

> MongoDB storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-mongo.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-mongo)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-mongo/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-mongo?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-mongo.svg)](https://www.npmjs.com/package/keyv-mongo)

## Install

```shell
npm install --save keyv-mongo
```

## Usage

```js
const Keyv = require('keyv');
const KeyvMongo = require('keyv-mongo');

const mongo = new KeyvMongo('mongodb://127.0.0.1:27017');
mongo.db.on('error', handleError);

const keyv = new Keyv({ store: mongo });
```

## License

MIT © Luke Childs
