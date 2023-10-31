import EventEmitter from 'node:events';
import type {KeyvStoreAdapter} from 'keyv';

class KeyvOffline extends EventEmitter implements KeyvStoreAdapter {
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
								return await keyv.get(...args);
							} catch {
								return undefined;
							}
						};
					}

					case 'getMany':
					{
						return async (...args: any) => {
							try {
								return await keyv.getMany(...args);
							} catch {
								return false;
							}
						};
					}

					case 'set':
					{
						return async (...args: any) => {
							try {
								return await keyv.set(...args);
							} catch {
								return false;
							}
						};
					}

					case 'clear':
					{
						return async (...args: any) => {
							try {
								return await keyv.clear(...args);
							} catch {
								return false;
							}
						};
					}

					case 'delete':
					{
						return async (...args: any) => {
							try {
								return await keyv.delete(...args);
							} catch {
								return false;
							}
						};
					}

					case 'has':
					{
						return async (...args: any) => {
							try {
								return await keyv.has(...args);
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

	get(key: string) {
		this.proxy.namespace = this.namespace;
		return this.proxy.get(key);
	}

	getMany(keys: string[]) {
		this.proxy.namespace = this.namespace;
		return this.proxy.getMany(keys);
	}

	delete(key: string) {
		this.proxy.namespace = this.namespace;
		return this.proxy.delete(key);
	}

	deleteMany(key: string[]) {
		this.proxy.namespace = this.namespace;
		return this.proxy.deleteMany(key);
	}

	clear() {
		this.proxy.namespace = this.namespace;
		return this.proxy.clear();
	}

	has(key: string) {
		this.proxy.namespace = this.namespace;
		return this.proxy.has(key);
	}
}

export = KeyvOffline;
