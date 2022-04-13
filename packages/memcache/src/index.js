'use strict';

const EventEmitter = require('events');
const memcache = require('memjs');
const JSONB = require('json-buffer');

class KeyvMemcache extends EventEmitter {
	constructor(uri, opts) {
		super();
		this.ttlSupport = true;

		opts = {

			...((typeof uri === 'string') ? {uri} : uri),
			...opts,
		};
		if (opts.uri && typeof opts.url === 'undefined') {
			opts.url = opts.uri;
		}

		if (uri === undefined) {
			uri = 'localhost:11211';
			// eslint-disable-next-line no-multi-assign
			opts.url = opts.uri = uri;
		}

		this.opts = opts;

		this.client = memcache.Client.create(uri, opts);
	}

	_getNamespace() {
		return `namespace:${this.namespace}`;
	}

	get(key) {
		return new Promise((resolve, reject) => {
			this.client.get(this.formatKey(key), (err, value) => {
				if (err) {
					this.emit('error', err);
					reject(err);
				} else {
					let val = {};
					if (value === null) {
						val = {
							value: undefined,
							expires: 0,
						};
					} else {
						val = this.opts.deserialize ? this.opts.deserialize(value) : JSONB.parse(value);
					}

					resolve(val);
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

				return data.every(x => x.value === undefined) ? [] : data;
			});
	}

	set(key, value, ttl) {
		const opts = {};

		if (ttl !== undefined) {
			// eslint-disable-next-line no-multi-assign
			opts.expires = opts.ttl = Math.floor(ttl / 1000); // Moving to seconds
		}

		return new Promise((resolve, reject) => {
			this.client.set(this.formatKey(key), value, opts, (err, success) => {
				if (err) {
					this.emit('error', err);
					reject(err);
				} else {
					resolve(success);
				}
			});
		});
	}

	delete(key) {
		return new Promise((resolve, reject) => {
			this.client.delete(this.formatKey(key), (err, success) => {
				if (err) {
					this.emit('error', err);
					reject(err);
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
			this.client.flush(err => {
				if (err) {
					this.emit('error', err);
					reject(err);
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
		return new Promise((resolve, reject) => {
			this.client.get(this.formatKey(key), (err, value) => {
				if (err) {
					// eslint-disable-next-line prefer-promise-reject-errors
					resolve(false);
				} else {
					resolve(value !== null);
				}
			});
		});
	}
}

module.exports = KeyvMemcache;
