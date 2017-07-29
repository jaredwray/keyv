'use strict';

const EventEmitter = require('events');
const Sequelize = require('sequelize');

class KeyvSqlite extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = false;
		opts = opts || {};
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		this.opts = Object.assign({
			uri: 'sqlite://:memory:',
			table: 'keyv',
			logging: false
		}, opts);

		const sequelize = new Sequelize(this.opts.uri, this.opts);
		this.Entry = sequelize.define(this.opts.table, {
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

module.exports = KeyvSqlite;
