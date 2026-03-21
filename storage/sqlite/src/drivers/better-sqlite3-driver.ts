import Database from "better-sqlite3";
import type { Db } from "../types.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

function createBetterSqlite3Connection(
	options: SqliteDriverConnectOptions,
): Db {
	const db = new Database(options.filename);

	if (options.busyTimeout) {
		db.pragma(`busy_timeout = ${options.busyTimeout}`);
	}

	if (options.wal) {
		const isInMemory = options.filename === ":memory:";
		if (isInMemory) {
			console.warn(
				"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
			);
		} else {
			db.pragma("journal_mode = WAL");
		}
	}

	const query = async (sqlString: string, ...parameter: unknown[]) => {
		// better-sqlite3 only accepts primitive bind values — coerce objects to JSON
		const safeParams = parameter.map((p) =>
			p !== null && typeof p === "object" ? JSON.stringify(p) : p,
		);
		const trimmed = sqlString.trimStart().toUpperCase();
		if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA")) {
			return db.prepare(sqlString).all(...safeParams);
		}

		db.prepare(sqlString).run(...safeParams);
		return [];
	};

	const close = async () => {
		db.close();
	};

	return { query, close };
}

export const betterSqlite3Driver: SqliteDriver = {
	name: "better-sqlite3",
	async connect(options: SqliteDriverConnectOptions): Promise<Db> {
		return createBetterSqlite3Connection(options);
	},
};
