// biome-ignore-all lint/style/noNonNullAssertion: need to fix
import EventEmitter from "node:events";
import Keyv, { type KeyvEntry, type KeyvStoreAdapter } from "keyv";
import type { DatabaseError } from "pg";
import { endPool, pool } from "./pool.js";
import type { KeyvPostgresOptions, Query } from "./types.js";

/**
 * Escapes a PostgreSQL identifier (table/schema name) to prevent SQL injection.
 * Uses double-quote escaping as per PostgreSQL standards.
 */
function escapeIdentifier(identifier: string): string {
	// Replace any double quotes with two double quotes (PostgreSQL escape sequence)
	// and wrap in double quotes
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * PostgreSQL storage adapter for Keyv.
 * Uses the `pg` library for connection pooling and parameterized queries.
 */
export class KeyvPostgres extends EventEmitter implements KeyvStoreAdapter {
	/** Resolved configuration options for the adapter. */
	public opts: KeyvPostgresOptions;
	/** Function for executing SQL queries against the PostgreSQL database. */
	private query: Query;
	/** Optional namespace used for key prefixing and scoping operations like `clear()`. */
	public namespace?: string;
	/**
	 * Creates a new KeyvPostgres instance.
	 * @param options - A PostgreSQL connection URI string or a {@link KeyvPostgresOptions} configuration object.
	 */
	constructor(options?: KeyvPostgresOptions | string) {
		super();

		if (typeof options === "string") {
			const uri = options;
			options = {
				dialect: "postgres",
				uri,
			};
		} else {
			options = {
				dialect: "postgres",
				uri: "postgresql://localhost:5432",
				...options,
			};
		}

		this.opts = {
			table: "keyv",
			schema: "public",
			keySize: 255,
			...options,
		};

		let createTable = `CREATE${this.opts.useUnloggedTable ? " UNLOGGED " : " "}TABLE IF NOT EXISTS ${this.opts.schema!}.${this.opts.table!}(key VARCHAR(${Number(this.opts.keySize!)}) PRIMARY KEY, value TEXT )`;

		if (this.opts.schema !== "public") {
			createTable = `CREATE SCHEMA IF NOT EXISTS ${this.opts.schema!}; ${createTable}`;
		}

		const connected = this.connect()
			.then(async (query) => {
				try {
					await query(createTable);
				} catch (error) {
					/* v8 ignore next -- @preserve */
					if ((error as DatabaseError).code !== "23505") {
						this.emit("error", error);
					}

					/* v8 ignore next -- @preserve */
					return query;
				}

				return query;
			})
			.catch((error) => this.emit("error", error));

		// biome-ignore lint/suspicious/noExplicitAny: type format
		this.query = async (sqlString: string, values?: any) =>
			connected
				// @ts-expect-error - query is not a boolean
				.then((query) => query(sqlString, values));
	}

	/**
	 * Gets a value by key.
	 * @param key - The key to retrieve.
	 * @returns The value associated with the key, or `undefined` if not found.
	 */
	public async get(key: string) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const rows = await this.query(select, [key]);
		const row = rows[0];
		return row === undefined ? undefined : row.value;
	}

	/**
	 * Gets multiple values by their keys.
	 * @param keys - An array of keys to retrieve.
	 * @returns An array of values in the same order as the keys, with `undefined` for missing keys.
	 */
	public async getMany(keys: string[]) {
		const getMany = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const rows = await this.query(getMany, [keys]);
		const rowsMap = new Map(rows.map((row) => [row.key, row]));

		return keys.map((key) => rowsMap.get(key)?.value);
	}

	/**
	 * Sets a key-value pair. Uses an upsert operation via `ON CONFLICT` to insert or update.
	 * @param key - The key to set.
	 * @param value - The value to store.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: type format
	public async set(key: string, value: any) {
		const upsert = `INSERT INTO ${this.opts.schema!}.${this.opts.table!} (key, value)
      VALUES($1, $2) 
      ON CONFLICT(key) 
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [key, value]);
	}

	/**
	 * Sets multiple key-value pairs at once using PostgreSQL `UNNEST` for efficient bulk operations.
	 * @param entries - An array of key-value entry objects.
	 */
	public async setMany(entries: KeyvEntry[]) {
		const keys = [];
		const values = [];
		for (const { key, value } of entries) {
			keys.push(key);
			values.push(value);
		}
		const upsert = `INSERT INTO ${this.opts.schema!}.${this.opts.table!} (key, value)
      SELECT * FROM UNNEST($1::text[], $2::text[])
      ON CONFLICT(key)
      DO UPDATE SET value=excluded.value;`;
		await this.query(upsert, [keys, values]);
	}

	/**
	 * Deletes a key from the store.
	 * @param key - The key to delete.
	 * @returns `true` if the key existed and was deleted, `false` otherwise.
	 */
	public async delete(key: string) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1`;
		const rows = await this.query(select, [key]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [key]);
		return true;
	}

	/**
	 * Deletes multiple keys from the store at once.
	 * @param keys - An array of keys to delete.
	 * @returns `true` if any of the keys existed and were deleted, `false` otherwise.
	 */
	public async deleteMany(keys: string[]) {
		const select = `SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = ANY($1)`;
		const rows = await this.query(select, [keys]);

		if (rows[0] === undefined) {
			return false;
		}

		await this.query(del, [keys]);
		return true;
	}

	/**
	 * Clears all keys in the current namespace. If no namespace is set, all keys are removed.
	 */
	public async clear() {
		const del = `DELETE FROM ${this.opts.schema!}.${this.opts.table!} WHERE key LIKE $1`;
		await this.query(del, [this.namespace ? `${this.namespace}:%` : "%"]);
	}

	/**
	 * Iterates over all key-value pairs, optionally filtered by namespace.
	 * Uses cursor-based (keyset) pagination with batch size controlled by `iterationLimit`.
	 * @param namespace - Optional namespace to filter keys by.
	 * @yields A `[key, value]` tuple for each entry.
	 */
	public async *iterator(namespace?: string) {
		const limit = Number.parseInt(String(this.opts.iterationLimit!), 10) || 10;

		// Escape special LIKE pattern characters in namespace
		const escapedNamespace = namespace
			? `${namespace.replace(/[%_\\]/g, "\\$&")}:`
			: "";
		const pattern = `${escapedNamespace}%`;

		// Use keyset pagination (cursor-based) instead of OFFSET to handle
		// concurrent deletions during iteration without skipping entries
		let lastKey: string | null = null;

		while (true) {
			let entries: Array<{ key: string; value: string }>;

			try {
				let select: string;
				let params: Array<string | number>;

				if (lastKey === null) {
					// First batch: no cursor constraint
					select = `SELECT * FROM ${escapeIdentifier(this.opts.schema!)}.${escapeIdentifier(this.opts.table!)} WHERE key LIKE $1 ORDER BY key LIMIT $2`;
					params = [pattern, limit];
				} else {
					// Subsequent batches: use keyset pagination
					select = `SELECT * FROM ${escapeIdentifier(this.opts.schema!)}.${escapeIdentifier(this.opts.table!)} WHERE key LIKE $1 AND key > $2 ORDER BY key LIMIT $3`;
					params = [pattern, lastKey, limit];
				}

				entries = await this.query(select, params);
			} catch (error) {
				// Emit error with context for debugging
				this.emit(
					"error",
					new Error(
						`Iterator failed at cursor ${lastKey ?? "start"}: ${(error as Error).message}`,
					),
				);
				return;
			}

			/* v8 ignore next -- @preserve */
			if (entries.length === 0) {
				return;
			}

			for (const entry of entries) {
				// Validate entry has key before yielding
				/* v8 ignore next -- @preserve */
				if (entry.key !== undefined && entry.key !== null) {
					yield [entry.key, entry.value];
				}
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
	 * Checks whether a key exists in the store.
	 * @param key - The key to check.
	 * @returns `true` if the key exists, `false` otherwise.
	 */
	public async has(key: string) {
		const exists = `SELECT EXISTS ( SELECT * FROM ${this.opts.schema!}.${this.opts.table!} WHERE key = $1 )`;
		const rows = await this.query(exists, [key]);
		return rows[0].exists;
	}

	/**
	 * Establishes a connection to the PostgreSQL database via the connection pool.
	 * @returns A query function that executes SQL statements and returns result rows.
	 */
	private async connect() {
		const conn = pool(this.opts.uri!, this.opts);
		// biome-ignore lint/suspicious/noExplicitAny: type format
		return async (sql: string, values?: any) => {
			const data = await conn.query(sql, values);
			return data.rows;
		};
	}

	/**
	 * Disconnects from the PostgreSQL database and releases the connection pool.
	 */
	public async disconnect() {
		await endPool();
	}
}

/**
 * Helper function to create a Keyv instance with KeyvPostgres as the storage adapter.
 * @param options - Optional {@link KeyvPostgresOptions} configuration object.
 * @returns A new Keyv instance backed by PostgreSQL.
 */
export const createKeyv = (options?: KeyvPostgresOptions) =>
	new Keyv({ store: new KeyvPostgres(options) });

export default KeyvPostgres;
export type { KeyvPostgresOptions } from "./types";
