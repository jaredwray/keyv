
const EventEmitter = require('events');
const Sql = require('sql').Sql;

class KeyvSql extends EventEmitter {
	constructor(options) {
		super();
		this.ttlSupport = false;

		this.opts = Object.assign({
			table: 'keyv',
			keySize: 255,
		}, options);

		const sql = new Sql(options.dialect);

		this.entry = sql.define({
			name: this.opts.table,
			columns: [
				{
					name: 'key',
					primaryKey: true,
					dataType: `VARCHAR(${Number(this.opts.keySize)})`,
				},
				{
					name: 'value',
					dataType: 'TEXT',
				},
			],
		});
		const createTable = this.entry.create().ifNotExists().toString();

		const connected = this.opts.connect()
			.then(query => query(createTable).then(() => query))
			.catch(error => this.emit('error', error));

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
		if (this.opts.dialect === 'mysql') {
			value = value.replace(/\\/g, '\\\\');
		}

		const upsert = this.opts.dialect === 'postgres' ? this.entry.insert({ key, value }).onConflict({ columns: ['key'], update: ['value'] }).toString() : this.entry.replace({ key, value }).toString();
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
