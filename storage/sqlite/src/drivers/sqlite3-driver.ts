import { promisify } from "node:util";
import type { Db } from "../types.js";
import { coerceParams, isReturningQuery, shouldApplyWal } from "./driver-utils.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

/**
 * Structural type for the `sqlite3` module so consumers don't need `@types/sqlite3`.
 */
export type Sqlite3ModuleLike = {
	Database: new (filename: string, callback?: (err: Error | null) => void) => Sqlite3DatabaseLike;
};

/**
 * Structural type for a `sqlite3.Database` instance.
 */
export type Sqlite3DatabaseLike = {
	all(sql: string, params: unknown[], callback: (err: Error | null, rows: unknown[]) => void): void;
	run(sql: string, params: unknown[], callback: (err: Error | null) => void): void;
	exec(sql: string, callback?: (err: Error | null) => void): void;
	configure(option: string, value: number): void;
	close(callback?: (err: Error | null) => void): void;
};

/**
 * Creates a {@link SqliteDriver} backed by the user-provided `sqlite3` module.
 *
 * @example
 * ```ts
 * import sqlite3 from "sqlite3";
 * import KeyvSqlite, { createSqlite3Driver } from "@keyv/sqlite";
 *
 * const store = new KeyvSqlite({
 *   uri: "sqlite://path/to/database.sqlite",
 *   driver: createSqlite3Driver(sqlite3),
 * });
 * ```
 */
export function createSqlite3Driver(sqlite3: Sqlite3ModuleLike): SqliteDriver {
	return {
		name: "custom",
		async connect(options: SqliteDriverConnectOptions): Promise<Db> {
			const db = await new Promise<Sqlite3DatabaseLike>((resolve, reject) => {
				const instance = new sqlite3.Database(options.filename, (err: Error | null) => {
					/* v8 ignore next 2 -- @preserve: error path */
					if (err) {
						reject(err);
					} else {
						resolve(instance);
					}
				});
			});

			const allAsync = promisify(db.all.bind(db)) as (
				sql: string,
				params: unknown[],
			) => Promise<unknown[]>;
			const runAsync = promisify(db.run.bind(db)) as (
				sql: string,
				params: unknown[],
			) => Promise<void>;
			const execAsync = promisify(db.exec.bind(db)) as (sql: string) => Promise<void>;
			const closeAsync = promisify(db.close.bind(db)) as () => Promise<void>;

			// busyTimeout uses configure() API, not PRAGMA
			if (options.busyTimeout) {
				db.configure("busyTimeout", Number(options.busyTimeout));
			}

			// WAL mode
			if (shouldApplyWal(options.filename, options.wal)) {
				await execAsync("PRAGMA journal_mode = WAL");
			}

			// Serial queue so statements stay ordered. A failed query must not
			// poison the queue or leave later callers hanging.
			let queue = Promise.resolve();

			const query = async (sqlString: string, ...parameter: unknown[]) => {
				const safeParams = coerceParams(parameter);
				const trimmed = sqlString.trimStart().toUpperCase();
				const task = queue.then(async () => {
					if (isReturningQuery(trimmed)) {
						return allAsync(sqlString, safeParams);
					}

					await runAsync(sqlString, safeParams);
					return [];
				});
				queue = task.then(
					() => undefined,
					() => undefined,
				);
				return task;
			};

			const close = async () => closeAsync();

			return { query, close };
		},
	};
}
