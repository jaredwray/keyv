'use strict';

const EventEmitter = require('events');
const Sequelize = require('sequelize');

class KeyvSqlite extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = false;
		opts = opts || {};
		this.opts = Object.assign({
			uri: 'sqlite://:memory:',
			table: 'keyv'
		}, opts);

		const sequelize = new Sequelize(this.opts.uri, this.opts);
		sequelize.authenticate()
			.catch(err => this.emit('error', err));
	}

	get(key) {
	}

	set(key, value, ttl) {
	}

	delete(key) {
	}

	clear() {
	}
}

module.exports = KeyvSqlite;
