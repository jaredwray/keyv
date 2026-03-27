import type { Db } from "../types.js";
import { createQueryFn, shouldApplyWal } from "./driver-utils.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

async function createNodeSqliteConnection(options: SqliteDriverConnectOptions): Promise<Db> {
	// Dynamic import — only available on Node.js 22.5+ with --experimental-sqlite
	// biome-ignore lint/suspicious/noExplicitAny: node:sqlite types may not be available
	const { DatabaseSync } = (await import("node:sqlite")) as any;
	const db = new DatabaseSync(options.filename);

	if (options.busyTimeout) {
		db.exec(`PRAGMA busy_timeout = ${Number(options.busyTimeout)}`);
	}

	if (shouldApplyWal(options.filename, options.wal)) {
		db.exec("PRAGMA journal_mode = WAL");
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

export const nodeSqliteDriver: SqliteDriver = {
	name: "node:sqlite",
	async connect(options: SqliteDriverConnectOptions): Promise<Db> {
		return createNodeSqliteConnection(options);
	},
};
