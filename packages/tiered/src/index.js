'use strict';

const EventEmitter = require('events');
const Keyv = require('keyv');

class KeyvTiered extends EventEmitter {
	constructor({remote = new Keyv(), local = new Keyv(), ...options}) {
		super();
		this.opts = {
			validator: () => true,
			dialect: 'tiered',
			...options,
		};
		this.remote = remote;
		this.local = local;
	}

	get(key) {
		return this.local.get(key).then(localResult => {
			if (localResult === undefined || !this.opts.validator(localResult, key)) {
				return this.remote.get(key).then(remoteResult => {
					if (remoteResult === localResult) {
						return remoteResult;
					}

					this.local.set(key, remoteResult);
					return remoteResult;
				});
			}

			return localResult;
		});
	}

	getMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.get(key));
		}

		return Promise.all(promises)
			.then(values => {
				const data = [];
				for (const value of values) {
					data.push(value);
				}

				return data.every(x => x === undefined) ? [] : data;
			});
	}

	set(key, value, ttl) {
		return Promise.all(
			['local', 'remote'].map(store => this[store].set(key, value, ttl)),
		);
	}

	clear() {
		return Promise.all(
			['local', !this.opts.localOnly && 'remote']
				.filter(Boolean)
				.map(store => this[store].clear()),
		).then(() => undefined);
	}

	delete(key) {
		return Promise.all(
			['local', !this.opts.localOnly && 'remote']
				.filter(Boolean)
				.map(store => this[store].delete(key)),
		).then(deleted => deleted.every(x => x === true));
	}

	deleteMany(keys) {
		const promises = [];
		for (const key of keys) {
			promises.push(this.delete(key));
		}

		return Promise.all(promises)
			.then(values => values.every(x => x));
	}

	has(key) {
		return this.local.has(key)
			.then(response => {
				if (response === false || !this.opts.validator(response, key)) {
					return this.remote.has(key);
				}

				return response;
			});
	}

	async * iterator(namespace) {
		const limit = Number.parseInt(this.iterationLimit, 10) || 10;
		this.remote.opts.iterationLimit = limit;
		for await (const enteries of this.remote.iterator(namespace)) {
			yield enteries;
		}
	}
}

module.exports = KeyvTiered;
