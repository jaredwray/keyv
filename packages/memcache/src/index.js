'use strict';

const EventEmitter = require('events');
const memcache = require('memjs');
const JSONB = require('json-buffer');

class KeyvMemcache extends EventEmitter {
	constructor(uri, options) {
		super();
		this.ttlSupport = true;

		options = {

			...((typeof uri === 'string') ? {uri} : uri),
			...options,
		};
		if (options.uri && typeof options.url === 'undefined') {
			options.url = options.uri;
		}

		if (uri === undefined) {
			uri = 'localhost:11211';
			// eslint-disable-next-line no-multi-assign
			options.url = options.uri = uri;
		}

		this.opts = options;

		this.client = memcache.Client.create(uri, options);
	}

	_getNamespace() {
		return `namespace:${this.namespace}`;
	}

	get(key) {
		return new Promise((resolve, reject) => {
			this.client.get(this.formatKey(key), (error, value) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					let value_ = {};
					if (value === null) {
						value_ = {
							value: undefined,
							expires: 0,
						};
					} else {
						value_ = this.opts.deserialize ? this.opts.deserialize(value) : JSONB.parse(value);
					}

					resolve(value_);
				}
			});
		});
	}

	getMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.allSettled(promises)
			.then(values => {
				const data = [];
				for (const value of values) {
					data.push(value.value);
				}

				return data;
			});
	}

	set(key, value, ttl) {
		const options = {};

		if (ttl !== undefined) {
			// eslint-disable-next-line no-multi-assign
			options.expires = options.ttl = Math.floor(ttl / 1000); // Moving to seconds
		}

		return new Promise((resolve, reject) => {
			this.client.set(this.formatKey(key), value, options, (error, success) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(success);
				}
			});
		});
	}

	delete(key) {
		return new Promise((resolve, reject) => {
			this.client.delete(this.formatKey(key), (error, success) => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(success);
				}
			});
		});
	}

	deleteMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.allSettled(promises)
			.then(values => values.every(x => x.value === true));
	}

	clear() {
		return new Promise((resolve, reject) => {
			this.client.flush(error => {
				if (error) {
					this.emit('error', error);
					reject(error);
				} else {
					resolve(undefined);
				}
			});
		});
	}

	formatKey(key) {
		let result = key;

		if (this.namespace) {
			result = this.namespace.trim() + ':' + key.trim();
		}

		return result;
	}

	has(key) {
		return new Promise(resolve => {
			this.client.get(this.formatKey(key), (error, value) => {
				if (error) {
					resolve(false);
				} else {
					resolve(value !== null);
				}
			});
		});
	}
}

module.exports = KeyvMemcache;
