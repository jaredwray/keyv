'use strict';

const EventEmitter = require('events');
const JSONB = require('json-buffer');

const loadStore = options => {
	const adapters = {
		redis: () => require('@keyv/redis'),
		mongodb: () => require('@keyv/mongo'),
		mongo: () => require('@keyv/mongo'),
		sqlite: () => require('@keyv/sqlite'),
		postgresql: () => require('@keyv/postgres'),
		postgres: () => require('@keyv/postgres'),
		mysql: () => require('@keyv/mysql')
	};
	if (options.adapter || options.uri) {
		const adapter = options.adapter || /^[^:]*/.exec(options.uri)[0];
		return new (adapters[adapter]())(options);
	}

	return new Map();
};

class Keyv extends EventEmitter {
	constructor(uri, options) {
		super();
		this.opts = Object.assign({
			namespace: 'keyv',
			serialize: JSONB.stringify,
			deserialize: JSONB.parse
		},
		(typeof uri === 'string') ? {
			uri
		} : uri,
		options
		);

		if (!this.opts.store) {
			const adapterOptions = Object.assign({}, this.opts);
			this.opts.store = loadStore(adapterOptions);
		}

		if (typeof this.opts.store.on === 'function') {
			this.opts.store.on('error', err => this.emit('error', err));
		}

		this.opts.store.namespace = this.opts.namespace;
	}

	_getKeyPrefix(key) {
		return `${this.opts.namespace}:${key}`;
	}

	get(key, options) {
		const keyPrefixed = this._getKeyPrefix(key);
		const {
			store
		} = this.opts;
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

				return (options && options.raw) ? data : data.value;
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

		const {
			store
		} = this.opts;

		return Promise.resolve()
			.then(() => {
				const expires = (typeof ttl === 'number') ? (Date.now() + ttl) : null;
				value = {
					value,
					expires
				};
				return this.opts.serialize(value);
			})
			.then(value => store.set(keyPrefixed, value, ttl))
			.then(() => true);
	}

	delete(key) {
		const keyPrefixed = this._getKeyPrefix(key);
		const {
			store
		} = this.opts;
		return Promise.resolve()
			.then(() => store.delete(keyPrefixed));
	}

	clear() {
		const {
			store
		} = this.opts;
		return Promise.resolve()
			.then(() => store.clear());
	}
}

module.exports = Keyv;
