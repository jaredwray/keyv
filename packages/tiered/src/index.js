'use strict';

const EventEmitter = require('events');
const Keyv = require('keyv');

class KeyvTiered extends EventEmitter {
	constructor({remote = new Keyv(), local = new Keyv(), ...options}) {
		super();
		const normalizedOptions = {
			validator: () => true,
			...options,
		};
		this.remote = remote;
		this.local = local;

		for (const key of Object.keys(normalizedOptions)) {
			(this[key] = normalizedOptions[key]);
		}
	}

	get(key) {
		return this.local.get(key).then(localResult => {
			console.log(this.validator(localResult, key));
			if (localResult === undefined || !this.validator(localResult, key)) {
				this.remote.get(key).then(remoteResult => {
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

	set(...args) {
		return Promise.all(
			['local', 'remote'].map(store => this[store].set(...args)),
		);
	}

	clear({localOnly = false} = {}) {
		return Promise.all(
			['local', !localOnly && 'remote']
				.filter(Boolean)
				.map(store => this[store].clear()),
		);
	}

	delete(key, {localOnly = false} = {}) {
		return Promise.all(
			['local', !localOnly && 'remote']
				.filter(Boolean)
				.map(store => this[store].delete(key)),
		).then(deleted => deleted);
	}

	has(key) {
		return this.local.has(key)
			.then(response => {
				if (response === false || !this.validator(response, key)) {
					return this.remote.has(key);
				}

				return response;
			});
	}
}

module.exports = KeyvTiered;
