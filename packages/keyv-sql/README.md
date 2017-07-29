# keyv-sqlite

> SQLite storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-sqlite.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-sqlite)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-sqlite/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-sqlite?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-sqlite.svg)](https://www.npmjs.com/package/keyv-sqlite)

## Install

```shell
npm install --save keyv-sqlite
```

## Usage

```js
const Keyv = require('keyv');
const KeyvSqlite = require('keyv-sqlite');

const sqlite = new KeyvSqlite('sqlite://path/to/database.sqlite');

const keyv = new Keyv({ store: sqlite });
```

## License

MIT © Luke Childs
