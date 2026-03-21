/* v8 ignore start -- @preserve: bun:sqlite only available in Bun runtime */
import type { Db } from "../types.js";
import { createQueryFn, shouldApplyWal } from "./driver-utils.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

async function createBunSqliteConnection(
	options: SqliteDriverConnectOptions,
): Promise<Db> {
	// Dynamic import — only available in Bun runtime
	// @ts-expect-error: bun:sqlite types may not be available
	// biome-ignore lint/suspicious/noExplicitAny: bun:sqlite types may not be available
	const { Database } = (await import("bun:sqlite")) as any;
	const db = new Database(options.filename);

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

export const bunSqliteDriver: SqliteDriver = {
	name: "bun:sqlite",
	async connect(options: SqliteDriverConnectOptions): Promise<Db> {
		return createBunSqliteConnection(options);
	},
};
/* v8 ignore stop */
