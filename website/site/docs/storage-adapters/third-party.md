---
title: Third-Party Storage Adapters
sidebarTitle: Third-Party Adapters
parent: Storage Adapters
order: 90
description: Community storage adapters and how to implement KeyvStorageAdapter.
---

# Third-Party Storage Adapters

Community adapters let you use backends beyond the [official list](/docs/storage-adapters/overview/). Any store that implements `KeyvStorageAdapter` (or a Map-like / legacy async store that Keyv can [bridge](/docs/legacy-storage-adapters/)) works.

# Available Adapters

| Adapter | Description |
|---------|-------------|
| [@resolid/keyv-sqlite](https://github.com/huijiewei/keyv-sqlite) | SQLite storage adapter for Keyv |
| [keyv-arango](https://github.com/TimMikeladze/keyv-arango) | ArangoDB storage adapter for Keyv |
| [keyv-azuretable](https://github.com/howlowck/keyv-azuretable) | Azure Table Storage/API adapter for Keyv |
| [keyv-browser](https://github.com/zaaack/keyv-browser) | Browser storage adapter including localStorage and indexedDB |
| [keyv-cloudflare](https://npm.im/keyv-cloudflare) | Storage adapter for Cloudflare Workers KV |
| [keyv-dynamodb](https://www.npmjs.com/package/keyv-dynamodb) | DynamoDB storage adapter for Keyv |
| [keyv-file](https://github.com/zaaack/keyv-file) | File system storage adapter for Keyv |
| [keyv-firestore](https://github.com/goto-bus-stop/keyv-firestore) | Firebase Cloud Firestore adapter for Keyv |
| [keyv-lru](https://www.npmjs.com/package/keyv-lru) | LRU storage adapter for Keyv |
| [keyv-momento](https://github.com/momentohq/node-keyv-adaptor/) | Momento storage adapter for Keyv |
| [keyv-mssql](https://github.com/pmorgan3/keyv-mssql) | Microsoft SQL Server adapter for Keyv |
| [keyv-null](https://www.npmjs.com/package/keyv-null) | Null storage adapter for Keyv |
| [keyv-s3fifo](https://github.com/BJS-kr/fast-s3-fifo-cache) | S3-FIFO storage adapter for Keyv |
| [keyv-upstash](https://github.com/mahdavipanah/keyv-upstash) | Upstash Redis adapter for Keyv |
| [quick-lru](https://github.com/sindresorhus/quick-lru) | Simple "Least Recently Used" (LRU) cache |

# How to Contribute

1. **Build your adapter** following `KeyvStorageAdapter` (below)
2. **Test** with [@keyv/test-suite](/docs/test-suite/)
3. **Publish** to npm with the `keyv` keyword
4. **Open a PR** adding a row to this page (`website/site/docs/storage-adapters/third-party.md`)

PR title: `docs: add [your-adapter-name] to third-party storage adapters`. Add the row in alphabetical order.

# Building a Storage Adapter

v6 adapters take an **absolute** `expires` (Unix ms) on `set` / `setMany` and declare `capabilities.expires`. Legacy relative-`ttl` adapters still work through `KeyvBridgeAdapter`.

```typescript
import type { IEventEmitter } from "hookified";
import type { KeyvStorageCapability, KeyvStorageEntry, KeyvValue } from "keyv";

type KeyvStorageGetResult<Value> = KeyvValue<Value> | string | undefined;

type KeyvStorageAdapter = {
  namespace?: string;
  capabilities?: KeyvStorageCapability;

  get<Value>(key: string): Promise<KeyvStorageGetResult<Value>>;
  set(key: string, value: unknown, expires?: number): Promise<boolean>;
  setMany<Value>(values: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  hasMany(keys: string[]): Promise<boolean[]>;
  getMany<Value>(keys: string[]): Promise<Array<KeyvStorageGetResult<Value | undefined>>>;
  deleteMany(keys: string[]): Promise<boolean[]>;
  disconnect?(): Promise<void>;
  iterator?<Value>(): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;
```

`KeyvStoreAdapter` is a deprecated alias of `KeyvStorageAdapter`.

## Required methods

| Method | Description |
|--------|-------------|
| `get(key)` | Return the stored payload or `undefined`. |
| `set(key, value, expires?)` | Persist a value. `expires` is absolute Unix ms; omit for no expiry. |
| `delete(key)` | Return `true` if the key existed. |
| `clear()` | Delete keys in the current namespace. |

## Optional methods

`has`, `hasMany`, `getMany`, `setMany`, `deleteMany`, `disconnect`, `iterator` — implement them for batch performance and iteration. Keyv (or the bridge) will loop single-key methods if they are missing.

## Minimal example

```typescript
import { EventEmitter } from "events";
import { keyvStorageCapability, type KeyvStorageAdapter, type KeyvStorageGetResult } from "keyv";

class MyCustomStore extends EventEmitter implements KeyvStorageAdapter {
  private store = new Map<string, { value: unknown; expires?: number }>();
  namespace?: string;

  get capabilities() {
    return keyvStorageCapability(this);
  }

  async get<Value>(key: string): Promise<KeyvStorageGetResult<Value> | undefined> {
    const data = this.store.get(key);
    if (!data) return undefined;
    if (data.expires && Date.now() > data.expires) {
      this.store.delete(key);
      return undefined;
    }
    return data as KeyvStorageGetResult<Value>;
  }

  async set(key: string, value: unknown, expires?: number): Promise<boolean> {
    this.store.set(key, { value, expires });
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async getMany<Value>(keys: string[]) {
    return Promise.all(keys.map((key) => this.get<Value>(key)));
  }

  async setMany() { return undefined; }
  async hasMany(keys: string[]) {
    return Promise.all(keys.map((key) => this.has(key)));
  }
  async deleteMany(keys: string[]) {
    return keys.map((key) => this.store.delete(key));
  }
}

export default MyCustomStore;
```

```typescript
import Keyv from "keyv";
import MyCustomStore from "./my-custom-store.js";

const keyv = new Keyv({ store: new MyCustomStore(), namespace: "my-app" });
await keyv.set("foo", "bar");
```

## Testing

```bash
npm install --save-dev vitest keyv @keyv/test-suite
```

```javascript
import { describe } from "vitest";
import keyvTestSuite from "@keyv/test-suite";
import Keyv from "keyv";
import MyCustomStore from "./my-custom-store.js";

keyvTestSuite(describe, Keyv, () => new MyCustomStore());
```

See the [storage adapters overview](/docs/storage-adapters/overview/) and [legacy adapters](/docs/legacy-storage-adapters/) for the v6 `expires` contract and bridging.
