import EventEmitter from 'events';
import { Sql } from 'sql-ts';
import { SQLDialects } from 'sql-ts/dist/configTypes';
import { TableWithColumns } from 'sql-ts/dist/table';
import { KeyvStore } from 'keyv';

export interface KeyvSqlOptions {
	dialect: SQLDialects;
	connect: () => Promise<(sqlString: string) => Promise<unknown>>;
	table?: string;
	keySize?: number;
}

export default abstract class KeyvSql<TVal> extends EventEmitter implements KeyvStore<TVal> {
	public namespace!: string;

	public readonly ttlSupport = false;

	public readonly opts: Required<KeyvSqlOptions>;

	public readonly entry: TableWithColumns<{
		key: string;
		value: string;
	}>;

	public readonly query: (sqlString: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

	constructor(opts: KeyvSqlOptions) {
		super();

		this.opts = {
			table: 'keyv',
			keySize: 255,
			...opts
		};

		const sql = new Sql(this.opts.dialect);

		this.entry = sql.define<{ key: string; value: string }>({
			name: this.opts.table,
			columns: [
				{
					name: 'key',
					primaryKey: true,
					dataType: `VARCHAR(${Number(this.opts.keySize)})`
				},
				{
					name: 'value',
					dataType: 'TEXT'
				}
			]
		});

		const connected = this.opts.connect()
			.then(async query => {
				const createTable = this.entry.create().ifNotExists().toString();
				await query(createTable);
				return query;
			})
			.catch(err => {
				this.emit('error', err);
			});

		this.query = async (sqlString: string) => {
			const query = await connected;
			if (query) {
				return query(sqlString);
			}
		};
	}

	public async get(key: string): Promise<void | string> {
		const select = this.entry.select().where({ key }).toString();
		const [row] = await this.query(select);
		if (row === undefined) {
			return undefined;
		}

		return row.value;
	}

	public async set(key: string, value: string): Promise<unknown> {
		let upsert;
		if (this.opts.dialect === 'mysql') {
			value = value.replace(/\\/g, '\\\\');
		}

		if (this.opts.dialect === 'postgres') {
			upsert = this.entry.insert({ key, value }).onConflict({ columns: ['key'], update: ['value'] }).toString();
		} else {
			upsert = this.entry.replace({ key, value }).toString();
		}

		return this.query(upsert);
	}

	public async delete(key: string): Promise<boolean> {
		const select = this.entry.select().where({ key }).toString();
		const del = this.entry.delete().where({ key }).toString();
		const [row] = await this.query(select);
		if (row === undefined) {
			return false;
		}

		await this.query(del);
		return true;
	}

	public async clear(): Promise<void> {
		const del = this.entry
			.delete()
			.where(this.entry.key.like(`${this.namespace}:%`))
			.toString();
		await this.query(del);
	}
}
