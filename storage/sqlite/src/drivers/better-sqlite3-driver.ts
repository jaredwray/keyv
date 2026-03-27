import Database from "better-sqlite3";
import type { Db } from "../types.js";
import { createQueryFn, shouldApplyWal } from "./driver-utils.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

function createBetterSqlite3Connection(options: SqliteDriverConnectOptions): Db {
	const db = new Database(options.filename);

	if (options.busyTimeout) {
		db.pragma(`busy_timeout = ${options.busyTimeout}`);
	}

	if (shouldApplyWal(options.filename, options.wal)) {
		db.pragma("journal_mode = WAL");
	}

	const query = createQueryFn(
		(sql, params) => db.prepare(sql).all(...params),
		(sql, params) => {
			db.prepare(sql).run(...params);
		},
	);

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
