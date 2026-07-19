import { Hookified } from "hookified";
import Keyv, {
	type KeyvAny,
	type KeyvStorageAdapter,
	type KeyvStorageEntry,
	type KeyvStorageGetResult,
	keyvStorageCapability,
} from "keyv";
import mysql, { type PoolOptions } from "mysql2";
import { createPool } from "./pool.js";
import type { KeyvMysqlKeyColumnOptions, KeyvMysqlOptions } from "./types.js";

const UTF8_MAX_BYTES_PER_CODE_POINT = 4;
const MYSQL_MAX_COMPOSITE_INDEX_BYTES = 3072;
const MAX_TIMER_DELAY_MILLISECONDS = 2_147_483_647;

/**
 * Escapes a possibly database-qualified MySQL identifier.
 * @returns {string} The safely escaped MySQL identifier.
 */
function escapeIdentifier(identifier: string): string {
	// Split on '.' to handle database-qualified names (e.g., "mydb.cache")
	// Escape each segment individually, then join with '.'
	return identifier
		.split(".")
		.map((segment) => `\`${segment.replace(/`/g, "``")}\``)
		.join(".");
}

/**
 * Ensures the configured key columns fit within MySQL's composite-index limit.
 * @returns {void}
 */
function validateCompositeIndexLength(keyLength: number, namespaceLength: number): void {
	for (const [name, value] of [
		["keyLength", keyLength],
		["namespaceLength", namespaceLength],
	] as const) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}

	const indexByteLength = (keyLength + namespaceLength) * UTF8_MAX_BYTES_PER_CODE_POINT;
	if (indexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
		throw new RangeError(
			`keyLength and namespaceLength require ${indexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
		);
	}
}

/**
 * Ensures a positive cleanup interval fits within Node.js's timer delay limit.
 * @returns {void}
 */
function validateIntervalExpiration(value: number | undefined): void {
	if (
		value !== undefined &&
		value > 0 &&
		(!Number.isFinite(value) || value * 1000 > MAX_TIMER_DELAY_MILLISECONDS)
	) {
		throw new RangeError(
			`intervalExpiration must not exceed ${MAX_TIMER_DELAY_MILLISECONDS / 1000} seconds`,
		);
	}
}

/**
 * Validates and encodes a key or namespace as byte-exact UTF-8 for VARBINARY storage.
 * @returns {Buffer} The UTF-8 encoded key or namespace.
 */
function encodeKeyPart(
	value: string,
	maximumLength: number,
	optionName: "keyLength" | "namespaceLength",
): Buffer {
	const characterLength = Array.from(value).length;
	if (characterLength > maximumLength) {
		throw new RangeError(
			`Value has ${characterLength} characters, exceeding the configured ${optionName} of ${maximumLength}`,
		);
	}

	return Buffer.from(value, "utf8");
}

type QueryType<T> = Promise<
	T extends
		| mysql.RowDataPacket[][]
		| mysql.RowDataPacket[]
		| mysql.ResultSetHeader
		| mysql.ResultSetHeader[]
		? T
		: never
>;

type ConnectionPool = ReturnType<typeof createPool>;
type SqlQuery = (sql: string) => Promise<unknown>;

/**
 * MySQL storage adapter for Keyv.
 */
export class KeyvMysql extends Hookified implements KeyvStorageAdapter {
	/**
	 * The MySQL connection URI.
	 * @default 'mysql://localhost'
	 */
	private _uri: string = "mysql://localhost";

	/**
	 * The table name used for storage.
	 * @default 'keyv'
	 */
	private _table: string = "keyv";

	/**
	 * The maximum key size in Unicode code points for the key column.
	 * @default 255
	 */
	private _keyLength: number = 255;

	/**
	 * The maximum namespace size in Unicode code points for the namespace column.
	 * @default 255
	 */
	private _namespaceLength: number = 255;

	/**
	 * The interval in seconds for application-level cleanup of expired entries.
	 * A value of undefined or 0 disables the automatic cleanup.
	 * @default undefined
	 */
	private _intervalExpiration?: number;

	/** The unref'd timer used for automatic expired-entry cleanup. */
	private _clearExpiredTimer?: ReturnType<typeof setInterval>;

	/** Whether an automatic expired-entry cleanup is currently running. */
	private _clearExpiredRunning = false;

	/**
	 * The number of rows to fetch per iteration batch.
	 * @default 10
	 */
	private _iterationLimit = 10;

	/**
	 * The namespace used to scope storage operations.
	 */
	private _namespace?: string;

	/**
	 * Additional mysql2 options for the connection pool.
	 */
	private _mysqlOptions: PoolOptions = {};

	/** The connection pool owned by this adapter. */
	private _pool?: ConnectionPool;

	/** Whether this adapter has started closing its connection pool. */
	private _disconnected = false;

	/** Increments whenever a connected adapter begins disconnecting. */
	private _disconnectGeneration = 0;

	/** The in-flight or completed connection pool shutdown. */
	private _disconnectPromise?: Promise<void>;

	/** The adapter's asynchronous schema initialization. */
	private _connected!: Promise<SqlQuery>;

	/** Serializes asynchronous connection and schema configuration changes. */
	private _configurationTransition: Promise<void> = Promise.resolve();

	/** Queries that started before a disconnect was requested. */
	private readonly _pendingQueries = new Set<Promise<unknown>>();

	/**
	 * Creates a new KeyvMysql instance.
	 * @param options - Configuration options or connection URI string
	 */
	constructor(options?: KeyvMysqlOptions | string) {
		super({ throwOnEmptyListeners: false });

		if (typeof options === "string") {
			this._uri = options;
		} else if (options) {
			if (options.uri !== undefined) {
				this._uri = options.uri;
			}

			if (options.table !== undefined) {
				this._table = options.table;
			}

			if (options.keyLength !== undefined) {
				this._keyLength = options.keyLength;
			}

			if (options.namespaceLength !== undefined) {
				this._namespaceLength = options.namespaceLength;
			}

			if (options.intervalExpiration !== undefined) {
				validateIntervalExpiration(options.intervalExpiration);
				this._intervalExpiration = options.intervalExpiration;
			}

			if (options.iterationLimit !== undefined) {
				this._iterationLimit = Number(options.iterationLimit);
			}

			this._mysqlOptions = this.generateMySqlOptions(options);
		}

		validateCompositeIndexLength(this._keyLength, this._namespaceLength);

		const connectionPool = createPool(this._uri, this._mysqlOptions);
		this._pool = connectionPool;
		const query = this.createPoolQuery(connectionPool);
		const connected = this.initializeTable(
			query,
			this._table,
			this._keyLength,
			this._namespaceLength,
		).then(() => query);

		// Prevent an unhandled rejection when an instance is constructed but never
		// queried. Real query failures still surface to callers because `this.query`
		// awaits the same `connected` promise below.
		connected.catch(() => {});
		this._connected = connected;

		this.query = <T>(sqlString: string): QueryType<T> => {
			if (this._disconnected) {
				return Promise.reject(new Error("MySQL adapter is disconnected")) as QueryType<T>;
			}

			const operation = this._connected.then((query) => query(sqlString));
			this._pendingQueries.add(operation);
			void operation.then(
				() => this._pendingQueries.delete(operation),
				() => this._pendingQueries.delete(operation),
			);
			return operation as QueryType<T>;
		};

		this.startClearExpiredTimer();
	}

	/** Declares support for absolute expiration timestamps. */
	public get capabilities() {
		return keyvStorageCapability(this);
	}

	/**
	 * Executes SQL statements against the active MySQL connection.
	 */
	public query: <T>(sqlString: string) => QueryType<T>;

	/**
	 * The active MySQL connection URI.
	 * @default 'mysql://localhost'
	 */
	public get uri(): string {
		return this._uri;
	}

	/**
	 * The active storage table.
	 * @default 'keyv'
	 */
	public get table(): string {
		return this._table;
	}

	/**
	 * The maximum key length in Unicode code points.
	 * @default 255
	 */
	public get keyLength(): number {
		return this._keyLength;
	}

	/**
	 * The maximum namespace length in Unicode code points.
	 * @default 255
	 */
	public get namespaceLength(): number {
		return this._namespaceLength;
	}

	/**
	 * The automatic expiration cleanup interval in seconds.
	 * `undefined` or `0` disables cleanup.
	 * @default undefined
	 */
	public get intervalExpiration(): number | undefined {
		return this._intervalExpiration;
	}

	/**
	 * Updates the automatic expiration cleanup interval.
	 */
	public set intervalExpiration(value: number | undefined) {
		validateIntervalExpiration(value);
		this._intervalExpiration = value;
		this.startClearExpiredTimer();
	}

	/**
	 * The number of rows fetched per iterator batch.
	 * @default 10
	 */
	public get iterationLimit(): number {
		return this._iterationLimit;
	}

	/**
	 * Updates the number of rows fetched per iterator batch.
	 */
	public set iterationLimit(value: number) {
		this._iterationLimit = value;
	}

	/**
	 * The namespace used to scope storage operations.
	 */
	public get namespace(): string | undefined {
		return this._namespace;
	}

	/**
	 * Updates the namespace used to scope storage operations.
	 */
	public set namespace(value: string | undefined) {
		this._namespace = value;
	}

	/**
	 * Switches the adapter to a new MySQL connection pool.
	 * @param uri - Connection URI for the new pool.
	 * @param mysqlOptions - mysql2 options for the new pool.
	 * @returns {Promise<void>} Resolves when the new pool is active.
	 * @throws If the connection or table initialization fails.
	 */
	public reconnect(uri: string, mysqlOptions: PoolOptions = {}): Promise<void> {
		const previousDisconnect = this._disconnectPromise;
		const disconnectGeneration = this._disconnectGeneration;
		return this.enqueueConfigurationTransition(async () => {
			if (previousDisconnect) {
				await previousDisconnect;
			}

			const nextMysqlOptions = { ...mysqlOptions };
			const nextPool = createPool(uri, nextMysqlOptions);
			const nextQuery = this.createPoolQuery(nextPool);
			try {
				await this.initializeTable(nextQuery, this._table, this._keyLength, this._namespaceLength);
			} catch (error) {
				await nextPool.end();
				throw error;
			}

			if (disconnectGeneration !== this._disconnectGeneration) {
				await nextPool.end();
				throw new Error("MySQL adapter was disconnected while reconnecting");
			}

			const previousPool = this._pool;
			const previousConnected = this._connected;
			const previousQueries = [...this._pendingQueries];
			this._uri = uri;
			this._mysqlOptions = nextMysqlOptions;
			this._pool = nextPool;
			this._connected = Promise.resolve(nextQuery);
			this._disconnected = false;
			this._disconnectPromise = undefined;
			this.startClearExpiredTimer();

			await Promise.allSettled([...previousQueries, previousConnected]);
			if (previousPool && previousPool !== nextPool) {
				await previousPool.end();
			}
		});
	}

	/**
	 * Initializes and switches to a storage table on the active connection.
	 * @param table - Table name, optionally database-qualified.
	 * @returns {Promise<void>} Resolves when the table is active.
	 * @throws If the adapter is disconnected or table initialization fails.
	 */
	public useTable(table: string): Promise<void> {
		return this.enqueueConfigurationTransition(async () => {
			this.assertConnected();
			if (table === this._table) {
				return;
			}

			const disconnectGeneration = this._disconnectGeneration;
			const query = await this._connected;
			await this.initializeTable(query, table, this._keyLength, this._namespaceLength);
			if (disconnectGeneration !== this._disconnectGeneration) {
				throw new Error("MySQL adapter was disconnected while changing tables");
			}

			this._table = table;
		});
	}

	/**
	 * Updates the key and namespace limits and resizes their table columns.
	 * @param options - New character limits; omitted values remain unchanged.
	 * @returns {Promise<void>} Resolves when the new limits are active.
	 * @throws If a limit is invalid, would truncate data, or the schema update fails.
	 */
	public resizeKeyColumns(options: KeyvMysqlKeyColumnOptions): Promise<void> {
		return this.enqueueConfigurationTransition(async () => {
			this.assertConnected();
			const keyLength = options.keyLength ?? this._keyLength;
			const namespaceLength = options.namespaceLength ?? this._namespaceLength;
			validateCompositeIndexLength(keyLength, namespaceLength);
			if (keyLength === this._keyLength && namespaceLength === this._namespaceLength) {
				return;
			}

			const query = await this._connected;
			const tableEsc = escapeIdentifier(this._table);
			const lengthRows = (await query(
				`SELECT MAX(CHAR_LENGTH(CONVERT(id USING utf8mb4))) AS keyLength, MAX(CHAR_LENGTH(CONVERT(namespace USING utf8mb4))) AS namespaceLength FROM ${tableEsc}`,
			)) as mysql.RowDataPacket[];
			const storedKeyLength = Number(lengthRows[0]?.keyLength ?? 0);
			const storedNamespaceLength = Number(lengthRows[0]?.namespaceLength ?? 0);
			if (storedKeyLength > keyLength) {
				throw new RangeError(
					`Cannot reduce keyLength to ${keyLength}; the table contains a ${storedKeyLength}-character key`,
				);
			}

			if (storedNamespaceLength > namespaceLength) {
				throw new RangeError(
					`Cannot reduce namespaceLength to ${namespaceLength}; the table contains a ${storedNamespaceLength}-character namespace`,
				);
			}

			const keyByteLength = keyLength * UTF8_MAX_BYTES_PER_CODE_POINT;
			const namespaceByteLength = namespaceLength * UTF8_MAX_BYTES_PER_CODE_POINT;
			await query(
				`ALTER TABLE ${tableEsc} MODIFY COLUMN id VARBINARY(${keyByteLength}) NOT NULL, MODIFY COLUMN namespace VARBINARY(${namespaceByteLength}) NOT NULL DEFAULT ''`,
			);
			this._keyLength = keyLength;
			this._namespaceLength = namespaceLength;
		});
	}

	/**
	 * Gets a value by key.
	 * @param key - The key to retrieve
	 * @returns {Promise<KeyvStorageGetResult<Value>>} The stored value or `undefined` if not found.
	 */
	public async get<Value>(key: string) {
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const sql = `SELECT value, expires FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
		const select = mysql.format(sql, [this.encodeKey(key), this.encodeNamespace(ns)]);

		const rows: mysql.RowDataPacket = await this.query(select);
		const row = rows[0];
		if (row === undefined) {
			return undefined as KeyvStorageGetResult<Value>;
		}

		if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
			await this.deleteExpiredKeys([key], ns, now);
			return undefined as KeyvStorageGetResult<Value>;
		}

		// Coerce a SQL NULL value to undefined so the adapter never returns null.
		return (row.value ?? undefined) as KeyvStorageGetResult<Value>;
	}

	/**
	 * Gets values by key.
	 * @param keys - Array of keys to retrieve
	 * @returns {Promise<Array<KeyvStorageGetResult<Value | undefined>>>} The stored values in input
	 * order, with `undefined` for missing keys.
	 */
	public async getMany<Value>(keys: string[]) {
		if (keys.length === 0) {
			return [];
		}

		const ns = this.getNamespaceValue();
		const now = Date.now();
		const sql = `SELECT CONVERT(id USING utf8mb4) AS id, value, expires FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
		const select = mysql.format(sql, [
			keys.map((key) => this.encodeKey(key)),
			this.encodeNamespace(ns),
		]);

		const rows: mysql.RowDataPacket[] = await this.query(select);

		const validMap = new Map<string, KeyvStorageGetResult<Value>>();
		const expiredKeys: string[] = [];
		for (const row of rows) {
			if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
				expiredKeys.push(row.id as string);
			} else {
				validMap.set(row.id as string, row.value as KeyvStorageGetResult<Value>);
			}
		}

		if (expiredKeys.length > 0) {
			await this.deleteExpiredKeys(expiredKeys, ns, now);
		}

		// Coerce missing keys and SQL NULL values to undefined so the adapter never returns null.
		return keys.map(
			(key) => (validMap.get(key) ?? undefined) as KeyvStorageGetResult<Value | undefined>,
		);
	}

	/**
	 * Sets a value by key.
	 * @param key - The key to set
	 * @param value - The value to store
	 * @param expires - Absolute expiry as Unix ms since epoch, or `undefined` for no expiry.
	 * @returns {Promise<boolean>} `true` on success, or `false` if an error occurred.
	 */
	public async set(key: string, value: KeyvAny, expires?: number): Promise<boolean> {
		try {
			const ns = this.getNamespaceValue();
			const sql = `INSERT INTO ${escapeIdentifier(this._table)} (id, value, namespace, expires)
			VALUES(?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE value=?, expires=?;`;
			const insert = [
				this.encodeKey(key),
				value,
				this.encodeNamespace(ns),
				expires ?? null,
				value,
				expires ?? null,
			];
			const upsert = mysql.format(sql, insert);
			await this.query(upsert);
			return true;
			/* v8 ignore start -- @preserve */
		} catch (error) {
			this.emit("error", error);
			return false;
		}
		/* v8 ignore stop -- @preserve */
	}

	/**
	 * Sets multiple entries.
	 * @param entries - Array of `{ key, value, expires? }` entry objects. `expires` is absolute Unix ms.
	 * @returns {Promise<boolean[] | undefined>} Per-entry success values in input order.
	 */
	public async setMany<Value>(entries: KeyvStorageEntry<Value>[]): Promise<boolean[] | undefined> {
		if (entries.length === 0) {
			return [];
		}

		try {
			const ns = this.getNamespaceValue();
			const values = entries.map(({ key, value, expires }) => [
				this.encodeKey(key),
				value,
				this.encodeNamespace(ns),
				expires ?? null,
			]);
			const placeholders = values.map(() => "(?, ?, ?, ?)").join(", ");
			const flatValues = values.flat();
			const sql = `INSERT INTO ${escapeIdentifier(this._table)} (id, value, namespace, expires)
			VALUES ${placeholders}
			ON DUPLICATE KEY UPDATE value=VALUES(value), expires=VALUES(expires);`;
			const upsert = mysql.format(sql, flatValues as mysql.SqlValue[]);
			await this.query(upsert);
			return entries.map(() => true);
		} catch (error) {
			this.emit("error", error);
			return entries.map(() => false);
		}
	}

	/**
	 * Deletes an entry by key.
	 * @param key - The key to delete
	 * @returns {Promise<boolean>} `true` if the key existed and was deleted; otherwise, `false`.
	 */
	public async delete(key: string) {
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
		const del = mysql.format(sql, [this.encodeKey(key), this.encodeNamespace(ns)]);
		const result = await this.query<mysql.ResultSetHeader>(del);
		return result.affectedRows > 0;
	}

	/**
	 * Deletes entries by key.
	 * @param key - Array of keys to delete
	 * @returns {Promise<boolean[]>} Per-key deletion results in input order.
	 */
	public async deleteMany(key: string[]): Promise<boolean[]> {
		const results: boolean[] = [];
		for (const k of key) {
			results.push(await this.delete(k));
		}

		return results;
	}

	/**
	 * Deletes all entries in the current namespace.
	 * @returns {Promise<void>} Resolves once the matching entries have been deleted.
	 */
	public async clear() {
		const ns = this.getNamespaceValue();
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE namespace = ?`;
		const del = mysql.format(sql, [this.encodeNamespace(ns)]);

		await this.query(del);
	}

	/**
	 * Iterates over unexpired entries in the current namespace.
	 * @returns {AsyncGenerator<[string, string], void, unknown>} An async generator of `[key, value]`
	 * tuples.
	 * @yields {[string, string]} A key-value tuple.
	 */
	public async *iterator(): AsyncGenerator<[string, string], void, unknown> {
		const limit = this._iterationLimit || 10;
		const namespaceValue = this.getNamespaceValue();
		let lastKey: string | null = null;

		while (true) {
			let sql: string;
			if (lastKey === null) {
				// First batch: no cursor constraint
				sql = mysql.format(
					`SELECT CONVERT(id USING utf8mb4) AS id, value, expires FROM ${escapeIdentifier(this._table)} WHERE namespace = ? AND (expires IS NULL OR expires > ?) ORDER BY id LIMIT ?`,
					[this.encodeNamespace(namespaceValue), Date.now(), limit],
				);
			} else {
				// Subsequent batches: use keyset pagination
				sql = mysql.format(
					`SELECT CONVERT(id USING utf8mb4) AS id, value, expires FROM ${escapeIdentifier(this._table)} WHERE namespace = ? AND id > ? AND (expires IS NULL OR expires > ?) ORDER BY id LIMIT ?`,
					[this.encodeNamespace(namespaceValue), this.encodeKey(lastKey), Date.now(), limit],
				);
			}

			const entries: mysql.RowDataPacket[] = await this.query(sql);
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				yield [entry.id, entry.value];
			}

			// Update cursor to the last key processed
			lastKey = entries[entries.length - 1].id;

			// If we got fewer entries than the limit, we've reached the end
			if (entries.length < limit) {
				return;
			}
		}
	}

	/**
	 * Checks whether a key exists.
	 * @param key - The key to check
	 * @returns {Promise<boolean>} `true` if the key exists; otherwise, `false`.
	 */
	public async has(key: string) {
		const ns = this.getNamespaceValue();
		const now = Date.now();
		const sql = `SELECT expires FROM ${escapeIdentifier(this._table)} WHERE id = ? AND namespace = ?`;
		const select = mysql.format(sql, [this.encodeKey(key), this.encodeNamespace(ns)]);
		const rows: mysql.RowDataPacket = await this.query(select);
		if (rows.length === 0) {
			return false;
		}

		if (rows[0].expires !== null && rows[0].expires !== undefined && rows[0].expires <= now) {
			await this.deleteExpiredKeys([key], ns, now);
			return false;
		}

		return true;
	}

	/**
	 * Checks whether keys exist.
	 * @param keys - Array of keys to check
	 * @returns {Promise<boolean[]>} Existence results in input order.
	 */
	public async hasMany(keys: string[]): Promise<boolean[]> {
		if (keys.length === 0) {
			return [];
		}

		const ns = this.getNamespaceValue();
		const now = Date.now();
		const sql = `SELECT CONVERT(id USING utf8mb4) AS id, expires FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ?`;
		const select = mysql.format(sql, [
			keys.map((key) => this.encodeKey(key)),
			this.encodeNamespace(ns),
		]);
		const rows: mysql.RowDataPacket[] = await this.query(select);

		const validKeys = new Set<string>();
		const expiredKeys: string[] = [];
		for (const row of rows) {
			if (row.expires !== null && row.expires !== undefined && row.expires <= now) {
				expiredKeys.push(row.id as string);
			} else {
				validKeys.add(row.id as string);
			}
		}

		if (expiredKeys.length > 0) {
			await this.deleteExpiredKeys(expiredKeys, ns, now);
		}

		return keys.map((key) => validKeys.has(key));
	}

	/**
	 * Deletes expired entries.
	 * @returns {Promise<void>} Resolves once expired entries have been deleted.
	 */
	public async clearExpired(): Promise<void> {
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE expires IS NOT NULL AND expires < ?`;
		const del = mysql.format(sql, [Date.now()]);
		await this.query(del);
	}

	/**
	 * Closes the connection pool.
	 * @returns {Promise<void>} Resolves once the connection pool has been closed.
	 */
	public disconnect(): Promise<void> {
		this.stopClearExpiredTimer();
		if (!this._disconnected) {
			this._disconnectGeneration++;
		}

		this._disconnected = true;
		this._disconnectPromise ??= (async () => {
			const pending = [...this._pendingQueries];
			pending.push(this._connected, this._configurationTransition);

			await Promise.allSettled(pending);
			await this._pool?.end();
			this._pool = undefined;
		})();
		return this._disconnectPromise;
	}

	/**
	 * Queues a configuration change.
	 * @returns {Promise<void>} The queued configuration transition.
	 */
	private enqueueConfigurationTransition(operation: () => Promise<void>): Promise<void> {
		const transition = this._configurationTransition.then(operation, operation);
		this._configurationTransition = transition.catch(() => {});
		return transition;
	}

	/**
	 * Verifies that the adapter is connected.
	 * @returns {void}
	 */
	private assertConnected(): void {
		if (this._disconnected) {
			throw new Error("MySQL adapter is disconnected");
		}
	}

	/**
	 * Creates a query function for a connection pool.
	 * @returns {SqlQuery} A query function bound to the supplied pool.
	 */
	private createPoolQuery(pool: ConnectionPool): SqlQuery {
		return async (sql: string) => {
			const data = await pool.query(sql);
			return data[0];
		};
	}

	/**
	 * Ensures a table has the required schema.
	 * @returns {Promise<void>} Resolves once the table is ready for adapter operations.
	 */
	private async initializeTable(
		query: SqlQuery,
		table: string,
		keyLength: number,
		namespaceLength: number,
	): Promise<void> {
		const tableEsc = escapeIdentifier(table);
		const indexNameValue = `${table}_key_namespace_idx`;
		const indexName = `\`${indexNameValue.replace(/`/g, "``")}\``;
		const expiresIndexName = `\`${(`${table}_expires_idx`).replace(/`/g, "``")}\``;
		const keyByteLength = keyLength * UTF8_MAX_BYTES_PER_CODE_POINT;
		const namespaceByteLength = namespaceLength * UTF8_MAX_BYTES_PER_CODE_POINT;
		const createTable = `CREATE TABLE IF NOT EXISTS ${tableEsc}(id VARBINARY(${keyByteLength}) NOT NULL, value TEXT, namespace VARBINARY(${namespaceByteLength}) NOT NULL DEFAULT '', expires BIGINT UNSIGNED DEFAULT NULL, UNIQUE INDEX ${indexName} (namespace, id), INDEX ${expiresIndexName} (expires))`;
		await query(createTable);

		const existingKeyColumns = (await query(
			`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
		)) as mysql.RowDataPacket[];
		const existingIdColumn = existingKeyColumns.find((column) => column.Field === "id");
		const existingNamespaceColumn = existingKeyColumns.find(
			(column) => column.Field === "namespace",
		);
		if (!existingIdColumn) {
			throw new Error(`Table ${table} does not have an id column`);
		}

		/** @returns {number} The configured byte or character width of the column. */
		const getColumnLength = (column: mysql.RowDataPacket): number => {
			const match = /\((\d+)\)/.exec(String(column.Type));
			/* v8 ignore next -- @preserve */
			if (!match) {
				throw new Error(`Cannot determine the width of ${String(column.Field)}`);
			}

			return Number(match[1]);
		};
		/** @returns {number} The byte width required after conversion to `VARBINARY`. */
		const getTargetByteLength = (column: mysql.RowDataPacket): number => {
			const columnLength = getColumnLength(column);
			return String(column.Type).toLowerCase().startsWith("varbinary(")
				? columnLength
				: columnLength * UTF8_MAX_BYTES_PER_CODE_POINT;
		};
		const existingTargetIndexByteLength =
			getTargetByteLength(existingIdColumn) +
			(existingNamespaceColumn
				? getTargetByteLength(existingNamespaceColumn)
				: namespaceByteLength);
		if (existingTargetIndexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
			throw new RangeError(
				`Existing key columns require ${existingTargetIndexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
			);
		}

		// Migration for existing tables: add namespace column.
		if (!existingNamespaceColumn) {
			try {
				await query(
					`ALTER TABLE ${tableEsc} ADD COLUMN namespace VARBINARY(${namespaceByteLength}) NOT NULL DEFAULT ''`,
				);
			} catch (error) {
				// Error 1060 = another adapter already added the column.
				/* v8 ignore next -- @preserve */
				if ((error as { errno?: number }).errno !== 1060) {
					throw error;
				}
			}
		}

		// Migrate each text column independently, preserving its existing character width.
		const keyColumns = (await query(
			`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
		)) as mysql.RowDataPacket[];
		const idColumn = keyColumns.find((column) => column.Field === "id");
		const namespaceColumn = keyColumns.find((column) => column.Field === "namespace");
		/* v8 ignore next -- @preserve */
		if (!idColumn || !namespaceColumn) {
			throw new Error(`Table ${table} must have id and namespace columns`);
		}
		const targetIndexByteLength =
			getTargetByteLength(idColumn) + getTargetByteLength(namespaceColumn);
		/* v8 ignore next -- @preserve */
		if (targetIndexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
			throw new RangeError(
				`Existing key columns require ${targetIndexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
			);
		}

		const idNeedsMigration = !String(idColumn.Type).toLowerCase().startsWith("varbinary(");
		const namespaceNeedsMigration = !String(namespaceColumn.Type)
			.toLowerCase()
			.startsWith("varbinary(");
		if (idNeedsMigration || namespaceNeedsMigration) {
			const modifyVarcharParts: string[] = [];
			const modifyVarbinaryParts: string[] = [];
			if (idNeedsMigration) {
				const idCharacterLength = getColumnLength(idColumn);
				modifyVarcharParts.push(
					`MODIFY COLUMN id VARCHAR(${idCharacterLength}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL`,
				);
				modifyVarbinaryParts.push(
					`MODIFY COLUMN id VARBINARY(${idCharacterLength * UTF8_MAX_BYTES_PER_CODE_POINT}) NOT NULL`,
				);
			}

			if (namespaceNeedsMigration) {
				const namespaceCharacterLength = getColumnLength(namespaceColumn);
				modifyVarcharParts.push(
					`MODIFY COLUMN namespace VARCHAR(${namespaceCharacterLength}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT ''`,
				);
				modifyVarbinaryParts.push(
					`MODIFY COLUMN namespace VARBINARY(${namespaceCharacterLength * UTF8_MAX_BYTES_PER_CODE_POINT}) NOT NULL DEFAULT ''`,
				);
			}

			await query(`ALTER TABLE ${tableEsc} ${modifyVarcharParts.join(", ")}`);
			await query(`ALTER TABLE ${tableEsc} ${modifyVarbinaryParts.join(", ")}`);
		}

		// Migration: drop old primary key (id alone)
		try {
			await query(`ALTER TABLE ${tableEsc} DROP PRIMARY KEY`);
		} catch (error) {
			// Error 1091 = Can't DROP - PK doesn't exist (already migrated), safe to ignore
			/* v8 ignore next -- @preserve */
			if ((error as { errno?: number }).errno !== 1091) {
				throw error;
			}
		}

		// Migration: make namespace the leftmost column of the composite unique index.
		const indexRows = (await query(
			mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name = ?`, [indexNameValue]),
		)) as mysql.RowDataPacket[];
		const indexColumns = [...indexRows]
			.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
			.map((row) => String(row.Column_name));
		const hasNamespaceFirstUniqueIndex =
			indexColumns.length === 2 &&
			indexColumns[0] === "namespace" &&
			indexColumns[1] === "id" &&
			indexRows.every((row) => Number(row.Non_unique) === 0);

		if (!hasNamespaceFirstUniqueIndex) {
			if (indexRows.length > 0) {
				await query(
					`ALTER TABLE ${tableEsc} DROP INDEX ${indexName}, ADD UNIQUE INDEX ${indexName} (namespace, id)`,
				);
			} else {
				try {
					await query(`CREATE UNIQUE INDEX ${indexName} ON ${tableEsc} (namespace, id)`);
				} catch (error) {
					// Error 1061 = another adapter already created the index.
					/* v8 ignore next -- @preserve */
					if ((error as { errno?: number }).errno !== 1061) {
						throw error;
					}
				}
			}
		}

		// Migration: add expires column
		try {
			await query(`ALTER TABLE ${tableEsc} ADD COLUMN expires BIGINT UNSIGNED DEFAULT NULL`);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			if ((error as { errno?: number }).errno !== 1060) {
				throw error;
			}
		}

		// Migration: create expires index
		try {
			await query(`CREATE INDEX ${expiresIndexName} ON ${tableEsc} (expires)`);
		} catch (error) {
			/* v8 ignore next -- @preserve */
			if ((error as { errno?: number }).errno !== 1061) {
				throw error;
			}
		}
	}

	/**
	 * Gets the namespace used in SQL parameters.
	 * @returns {string} The configured namespace or an empty string.
	 */
	private getNamespaceValue(): string {
		return this._namespace ?? "";
	}

	/**
	 * Validates and encodes a key.
	 * @returns {Buffer} The UTF-8 encoded key.
	 */
	private encodeKey(key: string): Buffer {
		return encodeKeyPart(key, this._keyLength, "keyLength");
	}

	/**
	 * Validates and encodes a namespace.
	 * @returns {Buffer} The UTF-8 encoded namespace.
	 */
	private encodeNamespace(namespace: string): Buffer {
		return encodeKeyPart(namespace, this._namespaceLength, "namespaceLength");
	}

	/**
	 * Starts the expiration cleanup timer.
	 * @returns {void}
	 */
	private startClearExpiredTimer(): void {
		this.stopClearExpiredTimer();
		if (this._disconnected) {
			return;
		}

		if (this._intervalExpiration !== undefined && this._intervalExpiration > 0) {
			this._clearExpiredTimer = setInterval(async () => {
				if (this._clearExpiredRunning) {
					return;
				}

				this._clearExpiredRunning = true;
				try {
					await this.clearExpired();
				} catch (error) {
					/* v8 ignore next -- @preserve */
					this.emit("error", error);
				} finally {
					this._clearExpiredRunning = false;
				}
			}, this._intervalExpiration * 1000);
			this._clearExpiredTimer.unref();
		}
	}

	/**
	 * Stops the expiration cleanup timer.
	 * @returns {void}
	 */
	private stopClearExpiredTimer(): void {
		if (this._clearExpiredTimer) {
			clearInterval(this._clearExpiredTimer);
			this._clearExpiredTimer = undefined;
		}
	}

	/**
	 * Deletes keys that expired before a read completed.
	 * @returns {Promise<void>} Resolves once the expired rows have been deleted.
	 */
	private async deleteExpiredKeys(
		keys: string[],
		namespace: string,
		expiresAt: number,
	): Promise<void> {
		const sql = `DELETE FROM ${escapeIdentifier(this._table)} WHERE id IN (?) AND namespace = ? AND expires IS NOT NULL AND expires <= ?`;
		const del = mysql.format(sql, [
			keys.map((key) => this.encodeKey(key)),
			this.encodeNamespace(namespace),
			expiresAt,
		]);
		await this.query(del);
	}

	/**
	 * Extracts mysql2 pool options.
	 * @returns {PoolOptions} The mysql2-specific connection pool options.
	 */
	private generateMySqlOptions(options: KeyvMysqlOptions): PoolOptions {
		const connectionOptionsKeys: Array<keyof PoolOptions> = [
			"authPlugins",
			"authSwitchHandler",
			"bigNumberStrings",
			"charset",
			"charsetNumber",
			"compress",
			"connectAttributes",
			"connectTimeout",
			"connectionLimit",
			"database",
			"dateStrings",
			"debug",
			"decimalNumbers",
			"disableEval",
			"enableKeepAlive",
			"flags",
			"gracefulEnd",
			"host",
			"idleTimeout",
			"infileStreamFactory",
			"insecureAuth",
			"isServer",
			"jsonStrings",
			"keepAliveInitialDelay",
			"localAddress",
			"maxIdle",
			"maxPreparedStatements",
			"multipleStatements",
			"namedPlaceholders",
			"nestTables",
			"password",
			"password1",
			"password2",
			"password3",
			"passwordSha1",
			"pool",
			"port",
			"queueLimit",
			"resetOnRelease",
			"queryFormat",
			"rowsAsArray",
			"socketPath",
			"ssl",
			"stream",
			"stringifyObjects",
			"supportBigNumbers",
			"timezone",
			"trace",
			"typeCast",
			"user",
			"waitForConnections",
		];

		const mysqlOptions: PoolOptions = {};
		for (const key of connectionOptionsKeys) {
			if (key in options) {
				(mysqlOptions as KeyvAny)[key] = (options as KeyvAny)[key];
			}
		}

		return mysqlOptions;
	}
}

/**
 * Creates a Keyv instance backed by MySQL.
 * @param options - Optional {@link KeyvMysqlOptions} configuration object or connection URI string.
 * @returns {Keyv} A new Keyv instance backed by MySQL.
 */
export const createKeyv = (options?: KeyvMysqlOptions | string) =>
	new Keyv({ store: new KeyvMysql(options) });

export default KeyvMysql;
export type { KeyvMysqlKeyColumnOptions, KeyvMysqlOptions } from "./types.js";
