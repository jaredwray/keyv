<h1 align="center"><img width="250" src="https://jaredwray.com/images/keyv.svg" alt="keyv"></h1>

> Simple key-value storage with support for multiple backends

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![bun](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/bun-test.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/dm/keyv.svg)](https://www.npmjs.com/package/keyv)
[![npm](https://img.shields.io/npm/v/keyv.svg)](https://www.npmjs.com/package/keyv)

# Getting Started

Keyv provides a consistent interface for key-value storage across multiple backends via storage adapters. It supports TTL-based expiry, making it suitable as a cache or a persistent key-value store.

Install Keyv:

```
npm install keyv
```

By default everything is stored in memory. You can optionally install a storage adapter for persistent backends:

```
npm install @keyv/redis
```

Use it:

```js
import Keyv from 'keyv';

const keyv = new Keyv();
await keyv.set('foo', 'bar');
await keyv.get('foo'); // 'bar'
```

For the full API documentation, see the [Keyv README](https://github.com/jaredwray/keyv/blob/main/core/keyv/README.md).

# Project Structure

This monorepo is organized into categorized directories:

```
core/             Core packages
  keyv/             Main Keyv library
  test-suite/       Shared test suite for API compliance
serialization/    Serialization packages
  serialize/        Default serializer (@keyv/serialize)
compression/      Compression adapters
  compress-brotli/
  compress-gzip/
  compress-lz4/
storage/          Storage adapters
  redis/  postgres/  mysql/  mongo/  sqlite/
  memcache/  etcd/  valkey/  dynamo/  bigmap/
website/          Documentation website (keyv.org)
```

# Packages

* [keyv](https://github.com/jaredwray/keyv/tree/main/core/keyv) - Simple key-value storage with support for multiple backends
* [test-suite](https://github.com/jaredwray/keyv/tree/main/core/test-suite) - Test suite for Keyv API compliance

## Storage Adapters

* [bigmap](https://github.com/jaredwray/keyv/tree/main/storage/bigmap) - BigMap storage adapter
* [dynamo](https://github.com/jaredwray/keyv/tree/main/storage/dynamo) - DynamoDB storage adapter
* [etcd](https://github.com/jaredwray/keyv/tree/main/storage/etcd) - Etcd storage adapter
* [memcache](https://github.com/jaredwray/keyv/tree/main/storage/memcache) - Memcache storage adapter
* [mongo](https://github.com/jaredwray/keyv/tree/main/storage/mongo) - MongoDB storage adapter
* [mysql](https://github.com/jaredwray/keyv/tree/main/storage/mysql) - MySQL/MariaDB storage adapter
* [postgres](https://github.com/jaredwray/keyv/tree/main/storage/postgres) - PostgreSQL storage adapter
* [redis](https://github.com/jaredwray/keyv/tree/main/storage/redis) - Redis storage adapter
* [sqlite](https://github.com/jaredwray/keyv/tree/main/storage/sqlite) - SQLite storage adapter
* [valkey](https://github.com/jaredwray/keyv/tree/main/storage/valkey) - Valkey (Open Source Redis) storage adapter

## Compression Adapters

* [compress-brotli](https://github.com/jaredwray/keyv/tree/main/compression/compress-brotli) - Brotli compression adapter
* [compress-gzip](https://github.com/jaredwray/keyv/tree/main/compression/compress-gzip) - Gzip compression adapter
* [compress-lz4](https://github.com/jaredwray/keyv/tree/main/compression/compress-lz4) - LZ4 compression adapter

## Serialization

* [serialize](https://github.com/jaredwray/keyv/tree/main/serialization/serialize) - Default serializer for Keyv (@keyv/serialize)

## Third-party Storage Adapters

We love the community and the third-party storage adapters they have built. They enable Keyv to be used with even more backends and use cases.

View the complete list of third-party storage adapters and learn how to build your own at https://keyv.org/docs/third-party-storage-adapters/

# Contributing

We welcome contributions! Here are some ways to get involved:

* **Pull Requests** - Fork the repo, make your changes, run `pnpm test`, and open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed instructions.
* **Issues** - Report bugs or request features by [opening an issue](https://github.com/jaredwray/keyv/issues). For bugs, include replication steps and error messages.
* **Questions** - Create an issue with the label "question" and include relevant context.
* **Storage Adapter Requests** - Create an issue with the label "storage adapter." Requests are given 30-60 days for community interest before being triaged.
* **Security** - See our [security policy](https://github.com/jaredwray/keyv/blob/main/SECURITY.md) for reporting vulnerabilities.
* **Code of Conduct** - Please review our [Code of Conduct](CODE_OF_CONDUCT.md).

# Keyv v5 to v6

We are actively working on Keyv v6, which includes several major changes such as improved TypeScript support, enhanced hooks system, and streamlined storage adapter interfaces. You can follow along with the development and see the full migration guide at https://keyv.org/docs/keyv-v5-to-v6

No major functionality will be added to Keyv v5. Only maintenance and security fixes will be applied going forward.

# License

[MIT © Jared Wray](./LICENSE)
