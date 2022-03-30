// @ts-ignore
'use strict';

const EventEmitter = require('events');

class KeyvOffline extends EventEmitter {
	constructor(keyv) {
		super();
		this.proxy = new Proxy(keyv, {
			get(keyv, method) {
				switch (method) {
					case 'get':
						return async (...args) => {
							try {
								const value = await keyv.get(...args);
								return value;
							} catch {
								return undefined;
							}
						};

					case 'set':
						return async (...args) => {
							try {
								const value = await keyv.set(...args);
								return value;
							} catch {
								return false;
							}
						};

					default:
						return Reflect.get(keyv, method);
				}
			},
		});
	}

	set(key, value, ttl) {
		return this.proxy.set(key, value, ttl);
	}

	get(key) {
		return this.proxy.get(key);
	}

	getMany(keys) {
		return this.proxy.getMany(keys);
	}

	delete(key) {
		return this.proxy.delete(key);
	}

	deleteMany(key) {
		return this.proxy.deleteMany(key);
	}

	clear() {
		return this.proxy.clear();
	}

	has(key) {
		return this.proxy.has(key);
	}

	async * iterator(namespace) {
		yield this.proxy.iterator(namespace);
	}
}

module.exports = KeyvOffline;
