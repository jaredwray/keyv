'use strict';

const EventEmitter = require('events');
const JSONB = require('json-buffer');

const loadStore = opts => {
	const adapters = {
		redis: () => require('@keyv/redis'),
		mongodb: () => require('@keyv/mongo'),
		mongo: () => require('@keyv/mongo'),
		sqlite: () => require('@keyv/sqlite'),
		postgresql: () => require('@keyv/postgres'),
		postgres: () => require('@keyv/postgres'),
		mysql: () => require('@keyv/mysql')
	};
	if (opts.adapter || opts.uri) {
		const adapter = opts.adapter || /^[^:]*/.exec(opts.uri)[0];
		return new (adapters[adapter]())(opts);
	}

	return new Map();
};

class Keyv extends EventEmitter {
	constructor(uri, opts) {
		super();
		this.opts = Object.assign(
			{
				namespace: 'keyv',
				serialize: JSONB.stringify,
				deserialize: JSONB.parse
			},
			(typeof uri === 'string') ? { uri } : uri,
			opts
		);

		if (!this.opts.store) {
			const adapterOpts = Object.assign({}, this.opts);
			this.opts.store = loadStore(adapterOpts);
		}

		if (typeof this.opts.store.on === 'function') {
			this.opts.store.on('error', err => this.emit('error', err));
		}

		this.opts.store.namespace = this.opts.namespace;
	}

	_getKeyPrefix(key) {
		return `${this.opts.namespace}:${key}`;
	}

	get(key, opts) {
		const keyPrefixed = this._getKeyPrefix(key);
		const { store } = this.opts;
		return Promise.resolve()
			.then(() => store.get(keyPrefixed))
			.then(data => {
				return (typeof data === 'string') ? this.opts.deserialize(data) : data;
			})
			.then(data => {
				if (data === undefined) {
					return undefined;
				}

				if (typeof data.expires === 'number' && Date.now() > data.expires) {
					this.delete(key);
					return undefined;
				}

				return (opts && opts.raw) ? data : data.value;
			});
	}

	set(key, value, ttl) {
		const keyPrefixed = this._getKeyPrefix(key);
		if (typeof ttl === 'undefined') {
			ttl = this.opts.ttl;
		}

		if (ttl === 0) {
			ttl = undefined;
		}

		const { store } = this.opts;

		return Promise.resolve()
			.then(() => {
				const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
				value = { value, expires };
				return this.opts.serialize(value);
			})
			.then(value => store.set(keyPrefixed, value, ttl))
			.then(() => true);
	}

	delete(key) {
		const keyPrefixed = this._getKeyPrefix(key);
		const { store } = this.opts;
		return Promise.resolve()
			.then(() => store.delete(keyPrefixed));
	}

	clear() {
		const { store } = this.opts;
		return Promise.resolve()
			.then(() => store.clear());
	}
}

module.exports = Keyv;
