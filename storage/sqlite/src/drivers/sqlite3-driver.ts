import type { Db } from "../types.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

/**
 * Structural type for the `sqlite3` module so consumers don't need `@types/sqlite3`.
 */
export type Sqlite3ModuleLike = {
	Database: new (
		filename: string,
		callback?: (err: Error | null) => void,
	) => Sqlite3DatabaseLike;
};

/**
 * Structural type for a `sqlite3.Database` instance.
 */
export type Sqlite3DatabaseLike = {
	all(
		sql: string,
		params: unknown[],
		callback: (err: Error | null, rows: unknown[]) => void,
	): void;
	run(
		sql: string,
		params: unknown[],
		callback: (err: Error | null) => void,
	): void;
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
				const instance = new sqlite3.Database(
					options.filename,
					(err: Error | null) => {
						if (err) {
							reject(err);
						} else {
							resolve(instance);
						}
					},
				);
			});

			// busyTimeout uses configure() API, not PRAGMA
			if (options.busyTimeout) {
				db.configure("busyTimeout", Number(options.busyTimeout));
			}

			// WAL mode
			if (options.wal) {
				const isInMemory =
					options.filename === ":memory:" || options.filename === "";
				if (isInMemory) {
					console.warn(
						"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
					);
				} else {
					db.exec("PRAGMA journal_mode = WAL");
				}
			}

			// Serial queue to ensure statement ordering
			let queue = Promise.resolve();

			const query = async (sqlString: string, ...parameter: unknown[]) => {
				// sqlite3 only accepts primitive bind values — coerce objects to JSON
				const safeParams = parameter.map((p) =>
					p !== null && typeof p === "object" ? JSON.stringify(p) : p,
				);
				const trimmed = sqlString.trimStart().toUpperCase();

				return new Promise<unknown[]>((resolve, reject) => {
					queue = queue.then(
						() =>
							new Promise<void>((done) => {
								if (
									trimmed.startsWith("SELECT") ||
									trimmed.startsWith("PRAGMA")
								) {
									db.all(sqlString, safeParams, (err, rows) => {
										if (err) {
											reject(err);
										} else {
											resolve(rows);
										}

										done();
									});
								} else {
									db.run(sqlString, safeParams, (err) => {
										if (err) {
											reject(err);
										} else {
											resolve([]);
										}

										done();
									});
								}
							}),
					);
				});
			};

			const close = async () =>
				new Promise<void>((resolve, reject) => {
					db.close((err) => {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					});
				});

			return { query, close };
		},
	};
}
