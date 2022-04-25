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

					case 'getMany':
						return async (...args) => {
							try {
								const value = await keyv.getMany(...args);
								return value;
							} catch {
								return false;
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

					case 'clear':
						return async (...args) => {
							try {
								const value = await keyv.clear(...args);
								return value;
							} catch {
								return false;
							}
						};

					case 'delete':
						return async (...args) => {
							try {
								const value = await keyv.delete(...args);
								return value;
							} catch {
								return false;
							}
						};

					case 'has':
						return async (...args) => {
							try {
								const value = await keyv.has(...args);
								return value;
							} catch {
								return false;
							}
						};

					default:
						return Reflect.get(keyv, method);
				}
			},
			set(target, prop, value) {
				target[prop] = value;
				return true;
			},
		});
		this.opts = keyv.opts;
	}

	set(key, value, ttl) {
		this.proxy.namespace = this.namespace;
		return this.proxy.set(key, value, ttl);
	}

	get(key) {
		this.proxy.namespace = this.namespace;
		return this.proxy.get(key);
	}

	getMany(keys) {
		this.proxy.namespace = this.namespace;
		return this.proxy.getMany(keys);
	}

	delete(key) {
		this.proxy.namespace = this.namespace;
		return this.proxy.delete(key);
	}

	deleteMany(key) {
		this.proxy.namespace = this.namespace;
		return this.proxy.deleteMany(key);
	}

	clear() {
		this.proxy.namespace = this.namespace;
		return this.proxy.clear();
	}

	has(key) {
		this.proxy.namespace = this.namespace;
		return this.proxy.has(key);
	}
}

module.exports = KeyvOffline;
