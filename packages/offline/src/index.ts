import EventEmitter from 'node:events';
import type {Store, StoredData} from 'keyv';

class KeyvOffline<Value=any> extends EventEmitter implements Store<Value> {
	proxy: any;
	opts: any;
	namespace: any;
	constructor(keyv: any) {
		super();
		this.proxy = new Proxy(keyv, {
			get(keyv, method) {
				switch (method) {
					case 'get':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.get(...args);
								return value;
							} catch {
								return undefined;
							}
						};
					}

					case 'getMany':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.getMany(...args);
								return value;
							} catch {
								return false;
							}
						};
					}

					case 'set':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.set(...args);
								return value;
							} catch {
								return false;
							}
						};
					}

					case 'clear':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.clear(...args);
								return value;
							} catch {
								return false;
							}
						};
					}

					case 'delete':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.delete(...args);
								return value;
							} catch {
								return false;
							}
						};
					}

					case 'has':
					{
						return async (...args: any) => {
							try {
								const value = await keyv.has(...args);
								return value;
							} catch {
								return false;
							}
						};
					}

					default:
					{
						return Reflect.get(keyv, method);
					}
				}
			},
			set(target, prop, value) {
				target[prop] = value;
				return true;
			},
		});
		this.opts = keyv.opts;
	}

	set(key: string, value: any, ttl?: number) {
		this.proxy.namespace = this.namespace;
		return this.proxy.set(key, value, ttl);
	}

	get(key: string): Value {
		this.proxy.namespace = this.namespace;
		return this.proxy.get(key);
	}

	getMany(keys: string[]): Array<StoredData<Value>> | Promise<Array<StoredData<Value>>> | undefined {
		this.proxy.namespace = this.namespace;
		return this.proxy.getMany(keys);
	}

	delete(key: string): boolean {
		this.proxy.namespace = this.namespace;
		return this.proxy.delete(key);
	}

	deleteMany(key: string[]): boolean {
		this.proxy.namespace = this.namespace;
		return this.proxy.deleteMany(key);
	}

	clear(): void {
		this.proxy.namespace = this.namespace;
		return this.proxy.clear();
	}

	has(key: string): boolean {
		this.proxy.namespace = this.namespace;
		return this.proxy.has(key);
	}
}

export = KeyvOffline;
