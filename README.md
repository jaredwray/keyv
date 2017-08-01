<h1 align="center">
	<img width="250" src="https://rawgit.com/lukechilds/keyv/master/media/logo.svg" alt="keyv">
</h1>

> Simple key-value store with support for multiple backends

[![Build Status](https://travis-ci.org/lukechilds/keyv.svg?branch=master)](https://travis-ci.org/lukechilds/keyv)
[![Coverage Status](https://coveralls.io/repos/github/lukechilds/keyv/badge.svg?branch=master)](https://coveralls.io/github/lukechilds/keyv?branch=master)
[![npm](https://img.shields.io/npm/v/keyv.svg)](https://www.npmjs.com/package/keyv)

Keyv is a simple key-value store with support for multiple backends via storage adapters. The Keyv API is basically just a promisified subset of the [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) API. Keyv also has TTL support making it suitable as a cache or persistent storage.

## Install

```shell
npm install --save keyv
```

## License

MIT © Luke Childs
