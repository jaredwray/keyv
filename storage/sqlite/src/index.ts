import { promisify } from "node:util";
import { Hookified } from "hookified";
import Keyv, {
	type KeyvEntry,
	type KeyvStoreAdapter,
	type StoredData,
} from "keyv";
import sqlite3 from "sqlite3";
import type { Db, DbClose, DbQuery, KeyvSqliteOptions } from "./types.js";

const toTableString = (input: string) => {
	const sanitized = String(input).replace(/[^a-zA-Z0-9_]/g, "");
	if (sanitized.length === 0) {
		throw new Error("Invalid table name: must contain alphanumeric characters");
	}
	return /^[a-zA-Z]/.test(sanitized) ? sanitized : `_${sanitized}`;
};

export class KeyvSqlite extends Hookified implements KeyvStoreAdapter {
	private _namespace?: string;
	private _uri = "sqlite://:memory:";
	private _table = "keyv";
	private _keySize = 255;
	private _namespaceLength = 255;
	private _dialect = "sqlite";
	private _db = ":memory:";
	private _busyTimeout?: number;
	private _iterationLimit: number | string = 10;
	private _wal = false;
	private _clearExpiredInterval = 0;
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	close: DbClose;
	query: DbQuery;

	constructor(keyvOptions?: KeyvSqliteOptions | string) {
		super({ throwOnEmptyListeners: false });

		if (typeof keyvOptions === "string") {
			this._uri = keyvOptions;
		} else if (keyvOptions) {
			this.setOptions(keyvOptions);
		}

		this._db = this._uri.replace(/^sqlite:\/\//, "");
		this._table = toTableString(this._table);

		const keySize = Number(this._keySize);
		if (!Number.isFinite(keySize) || keySize <= 0 || keySize > 65535) {
			throw new Error(
				"Invalid keySize: must be a positive number between 1 and 65535",
			);
		}

		const createTable = `CREATE TABLE IF NOT EXISTS ${this._table}(key VARCHAR(${keySize}) NOT NULL, value TEXT, namespace VARCHAR(${Number(this._namespaceLength)}) NOT NULL DEFAULT '', expires BIGINT DEFAULT NULL, UNIQUE(key, namespace))`;
		const createExpiresIndex = `CREATE INDEX IF NOT EXISTS ${this._table}_expires_idx ON ${this._table} (expires) WHERE expires IS NOT NULL`;

		const connected: Promise<Db> = this.createConnection()
			.then(async (database) => {
				// Check if table exists and needs migration
				const tableInfo = await database.query(
					`PRAGMA table_info(${this._table})`,
				);

				if (tableInfo.length === 0) {
					// Table doesn't exist — create with new schema
					await database.query(createTable);
				} else {
					// Table exists — check if migration is needed
					const columnNames = tableInfo.map((c: { name: string }) => c.name);
					if (!columnNames.includes("namespace")) {
						// Old schema detected — migrate by recreating table
						await database.query(
							`ALTER TABLE ${this._table} RENAME TO ${this._table}_migration_old`,
						);
						await database.query(createTable);
						await database.query(
							`INSERT INTO ${this._table} (key, value) SELECT key, value FROM ${this._table}_migration_old`,
						);
						await database.query(`DROP TABLE ${this._table}_migration_old`);
					} else if (!columnNames.includes("expires")) {
						// Has namespace but missing expires — add column
						await database.query(
							`ALTER TABLE ${this._table} ADD COLUMN expires BIGINT DEFAULT NULL`,
						);
					}
				}

				await database.query(createExpiresIndex);
				return database as Db;
			})
			/* v8 ignore next -- @preserve */
			.catch((error) => {
				/* v8 ignore next -- @preserve */
				this.emit("error", error);
				/* v8 ignore next -- @preserve */
				throw error;
			});

		this.query = async (sqlString, ...parameter) =>
			connected.then(async (database) =>
				database.query(sqlString, ...parameter),
			);

		this.close = async () => connected.then((database) => database.close());

		this.startClearExpiredTimer();
	}

	/**
	 * Get the namespace for the adapter.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Set the namespace for the adapter.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Get the options for the adapter.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public get opts(): any {
		return {
			uri: this._uri,
			dialect: this._dialect,
			table: this._table,
			keySize: this._keySize,
			keyLength: this._keySize,
			namespaceLength: this._namespaceLength,
			db: this._db,
			iterationLimit: this._iterationLimit,
			wal: this._wal,
			busyTimeout: this._busyTimeout,
			clearExpiredInterval: this._clearExpiredInterval,
		};
	}

	/**
	 * Set the options for the adapter.
	 */
	public set opts(options: KeyvSqliteOptions) {
		this.setOptions(options);
	}

	/**
	 * Get the interval in milliseconds between automatic expired-entry cleanup runs.
	 * @default 0
	 */
	public get clearExpiredInterval(): number {
		return this._clearExpiredInterval;
	}

	/**
	 * Set the interval in milliseconds between automatic expired-entry cleanup runs.
	 */
	public set clearExpiredInterval(value: number) {
		this._clearExpiredInterval = value;
		this.startClearExpiredTimer();
	}

	/**
	 * Gets a value by key.
	 */
	async get<Value>(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const select = `SELECT * FROM ${this._table} WHERE key = ? AND namespace = ?`;
		const rows = await this.query(select, strippedKey, ns);
		const row = rows[0];
		return row === undefined ? undefined : (row.value as Value);
	}

	/**
	 * Gets multiple values by their keys.
	 */
	async getMany<Value>(keys: string[]) {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const select = `SELECT * FROM ${this._table} WHERE key IN (SELECT value FROM json_each(?)) AND namespace = ?`;
		const rows = await this.query(select, JSON.stringify(strippedKeys), ns);

		return strippedKeys.map((key) => {
			const row = rows.find(
				(row: { key: string; value: Value }) => row.key === key,
			);
			return (row ? row.value : undefined) as StoredData<Value | undefined>;
		});
	}

	/**
	 * Sets a key-value pair.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	async set(key: string, value: any) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const expires = this.getExpiresFromValue(value);
		const upsert = `INSERT INTO ${this._table} (key, value, namespace, expires)
			VALUES(?, ?, ?, ?)
			ON CONFLICT(key, namespace)
			DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
		return this.query(upsert, strippedKey, value, ns, expires);
	}

	/**
	 * Sets multiple key-value pairs at once.
	 */
	async setMany(entries: KeyvEntry[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const ns = this.getNamespaceValue();
		const placeholders: string[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: type format
		const params: any[] = [];

		for (const { key, value } of entries) {
			const strippedKey = this.removeKeyPrefix(key);
			const expires = this.getExpiresFromValue(value);
			placeholders.push("(?, ?, ?, ?)");
			params.push(strippedKey, value, ns, expires);
		}

		const upsert = `INSERT INTO ${this._table} (key, value, namespace, expires)
			VALUES ${placeholders.join(", ")}
			ON CONFLICT(key, namespace)
			DO UPDATE SET value=excluded.value, expires=excluded.expires;`;
		await this.query(upsert, ...params);
	}

	/**
	 * Deletes a key from the store.
	 */
	async delete(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const select = `SELECT * FROM ${this._table} WHERE key = ? AND namespace = ?`;
		const del = `DELETE FROM ${this._table} WHERE key = ? AND namespace = ?`;

		const rows = await this.query(select, strippedKey, ns);
		const row = rows[0];
		if (row === undefined) {
			return false;
		}

		await this.query(del, strippedKey, ns);
		return true;
	}

	/**
	 * Deletes multiple keys from the store.
	 */
	async deleteMany(keys: string[]) {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const select = `SELECT COUNT(*) as cnt FROM ${this._table} WHERE key IN (SELECT value FROM json_each(?)) AND namespace = ?`;
		const del = `DELETE FROM ${this._table} WHERE key IN (SELECT value FROM json_each(?)) AND namespace = ?`;

		const countResult = await this.query(
			select,
			JSON.stringify(strippedKeys),
			ns,
		);
		if (countResult[0].cnt === 0) {
			return false;
		}

		await this.query(del, JSON.stringify(strippedKeys), ns);
		return true;
	}

	/**
	 * Clears all keys in the current namespace.
	 */
	async clear() {
		const del = `DELETE FROM ${this._table} WHERE namespace = ?`;
		await this.query(del, this.getNamespaceValue());
	}

	/**
	 * Checks whether a key exists.
	 */
	async has(key: string) {
		const strippedKey = this.removeKeyPrefix(key);
		const ns = this.getNamespaceValue();
		const exists = `SELECT EXISTS ( SELECT * FROM ${this._table} WHERE key = ? AND namespace = ? ) as exists_result`;
		const result = await this.query(exists, strippedKey, ns);
		return Object.values(result[0])[0] === 1;
	}

	/**
	 * Checks whether multiple keys exist.
	 */
	async hasMany(keys: string[]): Promise<boolean[]> {
		const strippedKeys = keys.map((k) => this.removeKeyPrefix(k));
		const ns = this.getNamespaceValue();
		const select = `SELECT key FROM ${this._table} WHERE key IN (SELECT value FROM json_each(?)) AND namespace = ?`;
		const rows = await this.query(select, JSON.stringify(strippedKeys), ns);
		const existingKeys = new Set(rows.map((row: { key: string }) => row.key));
		return strippedKeys.map((key) => existingKeys.has(key));
	}

	/**
	 * Deletes all expired entries from the store.
	 */
	async clearExpired(): Promise<void> {
		const del = `DELETE FROM ${this._table} WHERE expires IS NOT NULL AND expires < ?`;
		await this.query(del, Date.now());
	}

	/**
	 * Iterates over all key-value pairs using cursor-based pagination.
	 */
	async *iterator(namespace?: string) {
		const limit = Number.parseInt(String(this._iterationLimit), 10) || 10;
		const ns = namespace ?? "";
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				let select: string;
				// biome-ignore lint/suspicious/noExplicitAny: type format
				let params: any[];

				if (lastKey !== null) {
					select = `SELECT * FROM ${this._table} WHERE namespace = ? AND key > ? ORDER BY key LIMIT ?`;
					params = [ns, lastKey, limit];
				} else {
					select = `SELECT * FROM ${this._table} WHERE namespace = ? ORDER BY key LIMIT ?`;
					params = [ns, limit];
				}

				entries = await this.query(select, ...params);
				/* v8 ignore start -- @preserve */
			} catch (error) {
				this.emit(
					"error",
					new Error(
						`Iterator failed at cursor ${lastKey ?? "start"}: ${(error as Error).message}`,
					),
				);
				return;
			}
			/* v8 ignore stop */

			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Re-add namespace prefix for core compatibility
				const prefixedKey = namespace ? `${namespace}:${entry.key}` : entry.key;
				yield [prefixedKey, entry.value];
			}

			// Update cursor to the last key processed
			lastKey = entries[entries.length - 1].key;

			// If we got fewer entries than the limit, we've reached the end
			if (entries.length < limit) {
				return;
			}
		}
	}

	/**
	 * Disconnects from the database and stops cleanup timers.
	 */
	async disconnect() {
		this.stopClearExpiredTimer();
		await this.close();
	}

	/**
	 * Creates a new SQLite database connection.
	 */
	private async createConnection(): Promise<Db> {
		return new Promise<sqlite3.Database>((resolve, reject) => {
			const database = new sqlite3.Database(this._db, (error) => {
				/* v8 ignore next -- @preserve */
				if (error) {
					reject(error);
				} else {
					if (this._busyTimeout) {
						database.configure("busyTimeout", this._busyTimeout);
					}

					resolve(database);
				}
			});
		}).then(async (database) => {
			const query = promisify(database.all).bind(database);
			const close = promisify(database.close).bind(database);

			if (this._wal) {
				const isInMemory = this._db === ":memory:" || this._db === "";
				if (isInMemory) {
					console.warn(
						"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
					);
				} else {
					await query("PRAGMA journal_mode=WAL");
				}
			}

			return {
				query,
				close,
			};
		});
	}

	/**
	 * Strips the namespace prefix from a key added by the Keyv core.
	 */
	private removeKeyPrefix(key: string): string {
		if (this._namespace && key.startsWith(`${this._namespace}:`)) {
			return key.slice(this._namespace.length + 1);
		}

		return key;
	}

	/**
	 * Returns the namespace value for SQL parameters.
	 */
	private getNamespaceValue(): string {
		return this._namespace ?? "";
	}

	/**
	 * Extracts the `expires` timestamp from a serialized value.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	private getExpiresFromValue(value: any): number | null {
		// biome-ignore lint/suspicious/noExplicitAny: type format
		let data: any;
		if (typeof value === "string") {
			try {
				data = JSON.parse(value);
			} catch {
				return null;
			}
		} else {
			data = value;
		}

		if (data && typeof data === "object" && typeof data.expires === "number") {
			return data.expires;
		}

		return null;
	}

	/**
	 * Starts (or restarts) the automatic expired-entry cleanup interval.
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._clearExpiredInterval > 0) {
			this._clearExpiredTimer = setInterval(async () => {
				try {
					await this.clearExpired();
				} catch (error) {
					/* v8 ignore next -- @preserve */
					this.emit("error", error);
				}
			}, this._clearExpiredInterval);
			this._clearExpiredTimer.unref();
		}
	}

	/**
	 * Stops the automatic expired-entry cleanup interval.
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	private setOptions(options: KeyvSqliteOptions): void {
		if (options.uri !== undefined) {
			this._uri = options.uri;
		}

		if (options.table !== undefined) {
			this._table = options.table;
		}

		if (options.keySize !== undefined) {
			this._keySize = options.keySize;
		}

		if (options.keyLength !== undefined) {
			this._keySize = options.keyLength;
		}

		if (options.namespaceLength !== undefined) {
			this._namespaceLength = options.namespaceLength;
		}

		if (options.busyTimeout !== undefined) {
			this._busyTimeout = options.busyTimeout;
		}

		if (options.iterationLimit !== undefined) {
			this._iterationLimit = options.iterationLimit;
		}

		if (options.wal !== undefined) {
			this._wal = options.wal;
		}

		if (options.clearExpiredInterval !== undefined) {
			this._clearExpiredInterval = options.clearExpiredInterval;
		}
	}
}

export const createKeyv = (keyvOptions?: KeyvSqliteOptions | string) =>
	new Keyv({ store: new KeyvSqlite(keyvOptions) });

export default KeyvSqlite;
export type { KeyvSqliteOptions } from "./types";
