'use strict';

const EventEmitter = require('events');
const Sql = require('sql').Sql;

class KeyvSql extends EventEmitter {
	constructor(opts) {
		super();
		this.ttlSupport = false;

		opts = Object.assign({ table: 'keyv' }, opts);

		this.sql = new Sql(opts.dialect);

		this.entry = this.sql.define({
			name: opts.table,
			columns: [
				{
					name: 'key',
					dataType: 'VARCHAR(255)'
				},
				{
					name: 'value',
					dataType: 'TEXT'
				}
			]
		});
		const createTable = this.entry.create().ifNotExists().toString();

		this.connected = opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(err => this.emit('error', err));
	}

	get(key) {
		const select = this.entry.select().where({ key }).toString();
		return this.connected
			.then(query => query(select))
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}
				return row.value;
			});
	}

	set(key, value) {
		const insert = this.entry.insert({ key, value }).toString();
		return this.connected
			.then(query => query(insert));
	}

	delete(key) {
	}

	clear() {
	}
}

module.exports = KeyvSql;
