import { EventEmitter } from 'events';
import {Etcd3, Lease, PutBuilder, SingleRangeBuilder} from 'etcd3';
import { handleAll, retry, ExponentialBackoff } from 'cockatiel';

interface KeyvEtcdOptions {
  url?: string;
  uri?: string;
  ttl?: number;
}

class KeyvEtcd<Value=any> extends EventEmitter{
  public ttlSupport: boolean;
  public opts: KeyvEtcdOptions;
  public client: Etcd3;
  public lease?: Lease;

  constructor(options?: string | KeyvEtcdOptions) {
    super();
    this.ttlSupport = false;
    this.opts = {
      url: '127.0.0.1:2379',
      ...(typeof options === 'string' ? { url: options } : options),
    };

    if (this.opts.uri) {
      this.opts.url = this.opts.uri;
    }

    if (this.opts.ttl) {
      this.ttlSupport = typeof this.opts.ttl === 'number';
    }

    this.opts.url = this.opts.url?.replace(/^etcd:\/\//, '');

    const policy = retry(handleAll, { backoff: new ExponentialBackoff() });
    policy.onFailure((error) => {
      this.emit('error', error.reason);
    });

    this.client = new Etcd3({
      hosts: this.opts.url!,
      faultHandling: {
        // @ts-ignore
        host: () => policy,
        // @ts-ignore
        global: policy,
      },
    });

    this.client.getRoles().catch((error) => this.emit('error', error));

    if (this.ttlSupport) {
      this.lease = this.client.lease((this.opts.ttl!) / 1000, {
        autoKeepAlive: false,
      });
    }
  }

  get(key: string) : SingleRangeBuilder {
    return this.client.get(key);
  }

  async getMany(keys: string[]) {
    const promises = [];
    for (const key of keys) {
      promises.push(this.get(key));
    }

    const values = await Promise.allSettled(promises);
    const data: (PromiseSettledResult<string | null> | undefined)[] = [];
    for (const value of values) {
      if (value === null) {
        data.push(undefined);
      } else {
        data.push(value);
      }
    }
    return data;
  }

  set(key: string, value: string | number | Buffer): PutBuilder {
    return this.opts.ttl ? this.lease!.put(key).value(value) : this.client.put(key).value(value);
  }

  delete(key: string): Promise<boolean> {
    if (typeof key !== 'string') {
      return Promise.resolve(false);
    }

    return this.client.delete().key(key).then(key => key.deleted !== '0');
  }

  deleteMany(keys: string[]): Promise<boolean> {
    const promises = [];
    for (const key of keys) {
      promises.push(this.delete(key));
    }

    return Promise.allSettled(promises)
      .then(values => values.every(x => x));
  }

  clear() {
    // @ts-ignore - namespace comes from keyv
    const promise = this.namespace
      // @ts-ignore - namespace comes from keyv
      ? this.client.delete().prefix(this.namespace)
      : this.client.delete().all();
    return promise.then(() => undefined);
  }

  has(key: string): Promise<boolean> {
    return this.client.get(key).exists();
  }

  disconnect(): void {
    return this.client.close();
  }
}