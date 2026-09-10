# @keyv/valkey-glide [<img width="100" align="right" src="https://jaredwray.com/images/keyv-symbol.svg" alt="keyv">](https://github.com/jaredwray/keyv)

> Valkey GLIDE storage adapter for Keyv

[![build](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml/badge.svg)](https://github.com/jaredwray/keyv/actions/workflows/tests.yaml)
[![codecov](https://codecov.io/gh/jaredwray/keyv/branch/main/graph/badge.svg?token=bRzR3RyOXZ)](https://codecov.io/gh/jaredwray/keyv)
[![npm](https://img.shields.io/npm/v/@keyv/valkey-glide.svg)](https://www.npmjs.com/package/@keyv/valkey-glide)
[![npm](https://img.shields.io/npm/dm/@keyv/valkey-glide)](https://npmjs.com/package/@keyv/valkey-glide)

[Valkey GLIDE](https://glide.valkey.io/) storage adapter for [Keyv](https://github.com/jaredwray/keyv).

This adapter uses the official [`@valkey/valkey-glide`](https://www.npmjs.com/package/@valkey/valkey-glide) client (Rust core, Node bindings). Use [`@keyv/valkey`](https://github.com/jaredwray/keyv/tree/main/storage/valkey) if you want the `iovalkey` / ioredis-compatible client instead.

GLIDE can route reads with **AZ affinity** (`readFrom` + `clientAz`) and executes multi-key commands (`MGET`, `UNLINK`, `MSET`) in a cluster-aware way, which is the main reason to pick this adapter over `@keyv/valkey`.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Using the createKeyv function](#using-the-createkeyv-function)
- [AZ affinity](#az-affinity)
- [Constructor Options](#constructor-options)
- [Properties](#properties)
- [Methods](#methods)
- [Events](#events)
- [Expiration and TTL](#expiration-and-ttl)
- [Clustering](#clustering)
- [License](#license)

## Install

```shell
npm install --save keyv @keyv/valkey-glide
```

## Usage

`GlideClient.createClient` is async. The adapter constructor is **lazy**: the first command (or `getClient()`) opens the connection.

```js
import {createKeyv} from '@keyv/valkey-glide';

const keyv = createKeyv('redis://localhost:6379');
keyv.on('error', handleConnectionError);
await keyv.set('foo', 'bar');
console.log(await keyv.get('foo')); // 'bar'
```

Specify the class directly:

```js
import Keyv from 'keyv';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const store = new KeyvValkeyGlide('redis://localhost:6379');
const keyv = new Keyv({ store });
```

Reuse an existing GLIDE client:

```js
import Keyv from 'keyv';
import {GlideClient} from '@valkey/valkey-glide';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const client = await GlideClient.createClient({
  addresses: [{ host: 'localhost', port: 6379 }],
});
const store = new KeyvValkeyGlide(client);
const keyv = new Keyv({ store });
```

Cluster client:

```js
import {GlideClusterClient} from '@valkey/valkey-glide';
import KeyvValkeyGlide from '@keyv/valkey-glide';

const client = await GlideClusterClient.createClient({
  addresses: [
    { host: '127.0.0.1', port: 7001 },
    { host: '127.0.0.1', port: 7002 },
    { host: '127.0.0.1', port: 7003 },
  ],
});
const store = new KeyvValkeyGlide(client);
```

Or let the adapter create a cluster client:

```js
const store = new KeyvValkeyGlide({
  cluster: true,
  addresses: [{ host: '127.0.0.1', port: 7001 }],
});
```

## Using the createKeyv function

```js
import {createKeyv} from '@keyv/valkey-glide';

const keyv = createKeyv('redis://localhost:6379', { namespace: 'my-app' });
console.log(keyv.namespace); // 'my-app'
console.log(keyv.store.namespace); // 'my-app'
```

If no connect argument is provided, the default URI is `redis://localhost:6379`.

## AZ affinity

Pass GLIDE `readFrom` and `clientAz` so readonly commands prefer replicas in the same availability zone. See [GLIDE read strategies](https://glide.valkey.io/how-to/connections/read-strategy/).

```js
import KeyvValkeyGlide from '@keyv/valkey-glide';

const store = new KeyvValkeyGlide({
  addresses: [{ host: 'clustercfg.example.cache.amazonaws.com', port: 6379 }],
  useTLS: true,
  cluster: true,
  readFrom: 'AZAffinity',
  clientAz: 'us-east-1a',
});
```

`clientAz` is required when `readFrom` is `AZAffinity` or `AZAffinityReplicasAndPrimary`.

## Constructor Options

`KeyvValkeyGlide` accepts a URI string, an options object, or an existing `GlideClient` / `GlideClusterClient`. Adapter fields:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | `string` | `undefined` | Valkey connection URI (`redis://`, `rediss://`, `valkey://`, `valkeys://`) |
| `cluster` | `boolean` | `false` | Create a `GlideClusterClient` instead of `GlideClient` |
| `useSets` | `boolean` | `false` | Track keys in a Valkey SET for faster namespaced `clear()` |
| `namespace` | `string` | `undefined` | Prefix keys for multi-tenant isolation |

All other fields are forwarded to GLIDE (`addresses`, `useTLS`, `credentials`, `readFrom`, `clientAz`, `requestTimeout`, `clientName`, `databaseId`, …). See [BaseClientConfiguration](https://glide.valkey.io/languages/nodejs/api/interfaces/BaseClient.BaseClientConfiguration.html).

## Properties

### capabilities

`capabilities.expires` is `true`. `set()` / `setMany()` take an absolute Unix-ms `expires` timestamp.

### namespace

Get or set the key namespace.

### useSets

When `true`, data keys and a tracking SET use the `sets:` prefix (same layout as `@keyv/valkey`). Default `false`.

Prefer `false` on a cluster: the tracking SET and data keys hash to different slots.

### client

The underlying `GlideClient` or `GlideClusterClient`. Throws if the adapter has not connected yet — call `await store.getClient()` first, or perform any storage operation.

Replacing `store.client` switches to an existing instance without closing the previous one.

## Methods

Same Keyv storage contract as `@keyv/valkey`: `get`, `getMany`, `set`, `setMany`, `delete`, `deleteMany`, `has`, `hasMany`, `clear`, `iterator`, `disconnect`.

`getClient()` returns the connected GLIDE client, creating it if needed.

Missing keys are `undefined`, never `null`.

`disconnect()` calls GLIDE `close()`.

## Events

`KeyvValkeyGlide` extends [Hookified](https://hookified.org). It emits:

| Event | When |
| --- | --- |
| `connect` | A client was created or assigned |
| `disconnect` | `disconnect()` closed the client |
| `error` | Connect or write failed |

GLIDE itself is not an EventEmitter, so connection errors surface through thrown promises and the adapter `error` event rather than client `error` / `reconnecting` listeners.

## Expiration and TTL

Keyv passes an **absolute** Unix-ms expiry. The adapter writes it with `SET` + `PXAT` (`TimeUnit.UnixMilliseconds`). You still call `keyv.set(key, value, ttl)` with a relative millisecond TTL.

## Clustering

Pass a `GlideClusterClient` or `{ cluster: true, addresses: [...] }`.

`getMany` uses GLIDE `mget`, which splits cross-slot keys internally. `clear()` and `iterator()` use cluster `SCAN` so they cover every node — unlike `@keyv/valkey`, which documents `KEYS`/`SCAN` as single-node in cluster mode.

### Cluster gotchas

- **`useSets: true` is not cluster-safe** for the tracking SET vs data keys. Keep the default `useSets: false` on a cluster.

## License

[MIT © Jared Wray](LICENSE)
