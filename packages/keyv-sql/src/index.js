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
					primaryKey: true,
					dataType: 'VARCHAR(255)'
				},
				{
					name: 'value',
					dataType: 'TEXT'
				}
			]
		});
		const createTable = this.entry.create().ifNotExists().toString();

		const connected = opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(err => this.emit('error', err));

		this.query = sqlString => connected
			.then(query => query(sqlString));
	}

	get(key) {
		const select = this.entry.select().where({ key }).toString();
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return undefined;
				}
				return row.value;
			});
	}

	set(key, value) {
		let upsert = this.entry.replace({ key, value }).toString();
		if (this.sql.dialectName === 'postgres') {
			upsert = this.entry.insert({ key, value }).onConflict({ columns: ['key'], update: ['value'] }).toString();
		}
		return this.query(upsert);
	}

	delete(key) {
		const select = this.entry.select().where({ key }).toString();
		const del = this.entry.delete().where({ key }).toString();
		return this.query(select)
			.then(rows => {
				const row = rows[0];
				if (row === undefined) {
					return false;
				}
				return this.query(del)
					.then(() => true);
			});
	}

	clear() {
		const del = this.entry.delete(this.entry.key.like(`${this.namespace}:%`)).toString();
		return this.query(del)
			.then(() => undefined);
	}
}

module.exports = KeyvSql;
