# keyv-postgres

[![Greenkeeper badge](https://badges.greenkeeper.io/lukechilds/keyv-postgres.svg)](https://greenkeeper.io/)

> PostgreSQL storage adapter for Keyv

[![Build Status](https://travis-ci.org/lukechilds/keyv-postgres.svg?branch=master)](https://travis-ci.org/lukechilds/keyv-postgres)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv-postgres/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv-postgres?branch=master)
[![npm](https://img.shields.io/npm/v/keyv-postgres.svg)](https://www.npmjs.com/package/keyv-postgres)

## Install

```shell
npm install --save keyv-postgres
```

## Usage

```js
const Keyv = require('keyv');
const KeyvPostgres = require('keyv-postgres');

const postgres = new KeyvPostgres('postgresql://user:pass@example.com:5432/dbname');

const keyv = new Keyv({ store: postgres });
```

## License

MIT © Luke Childs
