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
						return async (...arguments_: any) => {
							try {
								return await keyv.get(...arguments_);
							} catch {
								return undefined;
							}
						};
					}

					case 'getMany':
					{
						return async (...arguments_: any) => {
							try {
								return await keyv.getMany(...arguments_);
							} catch {
								return false;
							}
						};
					}

					case 'set':
					{
						return async (...arguments_: any) => {
							try {
								return await keyv.set(...arguments_);
							} catch {
								return false;
							}
						};
					}

					case 'clear':
					{
						return async (...arguments_: any) => {
							try {
								return await keyv.clear(...arguments_);
							} catch {
								return false;
							}
						};
					}

					case 'delete':
					{
						return async (...arguments_: any) => {
							try {
								return await keyv.delete(...arguments_);
							} catch {
								return false;
							}
						};
					}

					case 'has':
					{
						return async (...arguments_: any) => {
							try {
								return await keyv.has(...arguments_);
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
			set(target, property, value) {
				target[property] = value;
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

export default KeyvOffline;
module.exports = KeyvOffline;
