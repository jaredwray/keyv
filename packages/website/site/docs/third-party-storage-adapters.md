---
title: 'Third-Party Storage Adapters'
sidebarTitle: 'Third-Party Adapters'
order: 5
---

# Third-Party Storage Adapters

> Community-built storage adapters for Keyv

The Keyv community has built storage adapters for many different backends. These adapters allow you to use Keyv with databases and storage systems beyond the officially supported ones.

Any storage adapter that follows the `KeyvStoreAdapter` interface will work seamlessly with Keyv.

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
| [keyv-upstash](https://github.com/mahdavipanah/keyv-upstash) | Upstash Redis adapter for Keyv |
| [quick-lru](https://github.com/sindresorhus/quick-lru) | Simple "Least Recently Used" (LRU) cache |

# How to Contribute

We love the community and the third-party storage adapters they have built. We welcome contributions of new storage adapters!

## Steps to Add Your Adapter

1. **Build your adapter** following the `KeyvStoreAdapter` interface (see below)
2. **Test your adapter** using the official [@keyv/test-suite](/docs/test-suite/) to ensure API compliance
3. **Publish to npm** with the `keyv` keyword in your `package.json`
4. **Submit a PR** to the [Keyv repository](https://github.com/jaredwray/keyv) adding your adapter to this list

## Creating a Pull Request

Once your adapter is published to npm and tested, submit a pull request to add it to this page:

1. Fork the [Keyv repository](https://github.com/jaredwray/keyv)
2. Edit the file `packages/website/site/docs/third-party-storage-adapters.md`
3. Add your adapter to the "Available Adapters" table in alphabetical order:
   ```markdown
   | [your-adapter-name](https://github.com/your-username/your-adapter) | Brief description of your adapter |
   ```
4. Create a pull request with:
   - **Title**: `docs: add [your-adapter-name] to third-party storage adapters`
   - **Description**: Include a link to your npm package and a brief explanation of what backend your adapter supports

We review pull requests regularly and appreciate your contributions to the Keyv ecosystem!

# Building a Storage Adapter

To build a storage adapter for Keyv, you need to implement the `KeyvStoreAdapter` interface. Here's the complete type definition:

```typescript
type StoredDataNoRaw<Value> = Value | undefined;
type StoredDataRaw<Value> = { value?: Value; expires?: number } | undefined;
type StoredData<Value> = StoredDataNoRaw<Value> | StoredDataRaw<Value>;

type IEventEmitter = {
  on(event: string, listener: (...args: any[]) => void): IEventEmitter;
};

type KeyvStoreAdapter = {
  opts: any;
  namespace?: string | undefined;

  // Required methods
  get<Value>(key: string): Promise<StoredData<Value> | undefined>;
  set(key: string, value: any, ttl?: number): any;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;

  // Optional methods for better performance
  setMany?(values: Array<{ key: string; value: any; ttl?: number }>): Promise<void>;
  has?(key: string): Promise<boolean>;
  hasMany?(keys: string[]): Promise<boolean[]>;
  getMany?<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>>;
  disconnect?(): Promise<void>;
  deleteMany?(key: string[]): Promise<boolean>;
  iterator?<Value>(namespace?: string): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void>;
} & IEventEmitter;
```

## Required Methods

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieve a value by key. Returns `undefined` if not found or expired. |
| `set(key, value, ttl?)` | Store a value with an optional TTL (time-to-live) in milliseconds. |
| `delete(key)` | Delete a key. Returns `true` if the key existed. |
| `clear()` | Delete all keys in the current namespace. |

## Optional Methods

| Method | Description |
|--------|-------------|
| `has(key)` | Check if a key exists. |
| `hasMany(keys)` | Check if multiple keys exist. |
| `getMany(keys)` | Retrieve multiple values at once. |
| `setMany(values)` | Store multiple values at once. |
| `deleteMany(keys)` | Delete multiple keys at once. |
| `disconnect()` | Close any open connections. |
| `iterator(namespace?)` | Async iterator over all keys/values in a namespace. |

## Example Implementation

Here's a minimal example of a custom storage adapter using an in-memory Map:

```typescript
import { EventEmitter } from 'events';
import type { KeyvStoreAdapter, StoredData } from 'keyv';

interface CacheItem {
  value: any;
  expires?: number;
}

class MyCustomStore extends EventEmitter implements KeyvStoreAdapter {
  private store: Map<string, CacheItem>;
  public opts: any;
  public namespace?: string;

  constructor(options: any = {}) {
    super();
    this.store = new Map();
    this.opts = options;
    this.namespace = options.namespace;
  }

  async get<Value>(key: string): Promise<StoredData<Value> | undefined> {
    const data = this.store.get(key);

    if (!data) {
      return undefined;
    }

    // Check if expired
    if (data.expires && Date.now() > data.expires) {
      this.store.delete(key);
      return undefined;
    }

    return data as StoredData<Value>;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const data: CacheItem = {
      value,
      expires: ttl ? Date.now() + ttl : undefined,
    };
    this.store.set(key, data);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  // Optional: Implement batch operations for better performance
  async getMany<Value>(keys: string[]): Promise<Array<StoredData<Value | undefined>>> {
    const values: Array<StoredData<Value | undefined>> = [];
    for (const key of keys) {
      values.push(await this.get<Value>(key));
    }
    return values;
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    for (const key of keys) {
      this.store.delete(key);
    }
    return true;
  }

  async has(key: string): Promise<boolean> {
    const data = this.store.get(key);
    if (!data) {
      return false;
    }
    if (data.expires && Date.now() > data.expires) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export default MyCustomStore;
```

## Using Your Custom Adapter

```typescript
import Keyv from 'keyv';
import MyCustomStore from './my-custom-store';

const store = new MyCustomStore({ namespace: 'my-app' });
const keyv = new Keyv({ store });

// Use Keyv as normal
await keyv.set('foo', 'bar');
const value = await keyv.get('foo'); // 'bar'
```

## Testing Your Adapter

Use the official [@keyv/test-suite](/docs/test-suite/) to verify your adapter is API-compliant:

```bash
npm install --save-dev vitest keyv @keyv/test-suite
```

Create a test file:

```javascript
import { describe } from 'vitest';
import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import MyCustomStore from './my-custom-store';

const store = () => new MyCustomStore();
keyvTestSuite(describe, Keyv, store);
```

Run with:

```bash
npx vitest
```

# License

[MIT © Jared Wray](LISCENCE)
