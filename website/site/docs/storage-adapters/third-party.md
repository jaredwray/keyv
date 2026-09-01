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
| `getMany(keys)` | Return stored payloads in the same order as the keys. |
| `setMany(entries)` | Persist entries and return one result per entry. |
| `delete(key)` | Return `true` if the key existed. |
| `deleteMany(keys)` | Delete keys and return one result per key. |
| `clear()` | Delete keys in the current namespace. |
| `has(key)` | Return whether a live value exists. |
| `hasMany(keys)` | Return one existence result per key. |

## Optional methods

`disconnect` and `iterator` are optional. The other methods above are part of the direct v6 adapter contract.

## Minimal example

```typescript
import { EventEmitter } from "events";
import {
  keyvStorageCapability,
  type KeyvStorageAdapter,
  type KeyvStorageCapability,
  type KeyvStorageEntry,
  type KeyvStorageGetResult,
} from "keyv";

type StoredEntry = {
  payload: unknown;
  expires?: number;
};

class MyCustomStore extends EventEmitter implements KeyvStorageAdapter {
  public namespace?: string;
  private readonly data: Map<string, StoredEntry>;

  public constructor(data = new Map<string, StoredEntry>()) {
    super();
    this.data = data;
  }

  public get capabilities(): KeyvStorageCapability {
    return keyvStorageCapability(this);
  }

  private prefix(): string {
    return this.namespace ? `${this.namespace}:` : "";
  }

  private storageKey(key: string): string {
    return `${this.prefix()}${key}`;
  }

  private liveEntry(key: string): StoredEntry | undefined {
    const storageKey = this.storageKey(key);
    const entry = this.data.get(storageKey);

    if (entry?.expires !== undefined && entry.expires <= Date.now()) {
      this.data.delete(storageKey);
      return undefined;
    }

    return entry;
  }

  public async get<Value>(key: string): Promise<KeyvStorageGetResult<Value>> {
    return this.liveEntry(key)?.payload as KeyvStorageGetResult<Value>;
  }

  public async set(key: string, value: unknown, expires?: number): Promise<boolean> {
    const storageKey = this.storageKey(key);
    if (expires !== undefined && expires <= Date.now()) {
      this.data.delete(storageKey);
      return true;
    }

    const entry: StoredEntry =
      expires === undefined ? { payload: value } : { payload: value, expires };
    this.data.set(storageKey, entry);
    return true;
  }

  public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[]> {
    return Promise.all(
      entries.map(({ key, value, expires }) => this.set(key, value, expires)),
    );
  }

  public async delete(key: string): Promise<boolean> {
    return this.data.delete(this.storageKey(key));
  }

  public async deleteMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((key) => this.delete(key)));
  }

  public async getMany<Value>(
    keys: string[],
  ): Promise<Array<KeyvStorageGetResult<Value | undefined>>> {
    return Promise.all(keys.map((key) => this.get<Value | undefined>(key)));
  }

  public async has(key: string): Promise<boolean> {
    return this.liveEntry(key) !== undefined;
  }

  public async hasMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((key) => this.has(key)));
  }

  public async clear(): Promise<void> {
    const prefix = this.prefix();
    if (!prefix) {
      this.data.clear();
      return;
    }

    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        this.data.delete(key);
      }
    }
  }

  public async *iterator<Value>(): AsyncGenerator<
    Array<string | Awaited<Value> | undefined>,
    void
  > {
    const prefix = this.prefix();
    for (const [storageKey, entry] of this.data) {
      if (prefix && !storageKey.startsWith(prefix)) continue;
      if (entry.expires !== undefined && entry.expires <= Date.now()) {
        this.data.delete(storageKey);
        continue;
      }

      const key = prefix ? storageKey.slice(prefix.length) : storageKey;
      yield [key, entry.payload as Awaited<Value>];
    }
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
