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
		this.Entry = sequelize.define('entry', {
			key: {
				primaryKey: true,
				unique: true,
				type: Sequelize.STRING
			},
			value: {
				type: Sequelize.TEXT
			}
		}, {
			timestamps: false
		});

		this.connected = sequelize.authenticate()
			.then(() => sequelize.sync())
			.catch(err => this.emit('error', err));
	}

	get(key) {
		return this.connected
			.then(() => this.Entry.findById(key))
			.then(data => data.get('value'));
	}

	set(key, value) {
		return this.connected
			.then(() => this.Entry.upsert({ key, value }));
	}

	delete(key) {
		return this.connected
			.then(() => this.Entry.destroy({ where: { key } }));
	}

	clear() {
		return this.connected
			.then(() => this.Entry.destroy({ where: {} }));
	}
}

module.exports = KeyvSqlite;
