'use strict';

const EventEmitter = require('events');
const Sequelize = require('sequelize');

class KeyvSequelize extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = false;

		const sequelize = new Sequelize(opts.uri, opts);
		this.Entry = sequelize.define(opts.table, {
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
			.then(data => {
				if (data === null) {
					return undefined;
				}
				return data.get('value');
			});
	}

	set(key, value) {
		return this.connected
			.then(() => this.Entry.upsert({ key, value }));
	}

	delete(key) {
		return this.connected
			.then(() => this.Entry.destroy({ where: { key } }))
			.then(items => items > 0);
	}

	clear() {
		return this.connected
			.then(() => this.Entry.destroy({
				where: {
					key: { $like: `${this.namespace}:%` }
				}
			}))
			.then(() => undefined);
	}
}

module.exports = KeyvSequelize;
