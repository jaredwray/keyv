[<img width="100" align="right" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">](https://github.com/jaredwray/keyv-memcache)

# Keyv-Memcache
> Memcache storage adapter for Keyv


[![Build Status](https://travis-ci.org/jaredwray/keyv-memcache.svg?branch=master)](https://travis-ci.org/jaredwray/keyv-memcache)
[![GitHub license](https://img.shields.io/github/license/jaredwray/keyv-memcache)](https://github.com/jaredwray/keyv-memcache/blob/master/LICENSE)

MemCache storage adapter for [Keyv](https://github.com/lukechilds/keyv).

## Install

```shell
npm install --save keyv-memcache
```
or 
```
yarn add keyv-memcache
```

## Usage

```js
const Keyv = require('keyv');
const KeyvMemcache = require('keyv-memcache');

const memcache = new KeyvMemcache('user:pass@localhost:11211');
const keyv = new Keyv({ store: memcache });
```

## License

MIT © Jared Wray
