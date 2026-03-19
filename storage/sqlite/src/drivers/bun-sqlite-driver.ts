/* v8 ignore start -- @preserve: bun:sqlite only available in Bun runtime */
import type { Db } from "../types.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

async function createBunSqliteConnection(
	options: SqliteDriverConnectOptions,
): Promise<Db> {
	// Dynamic import — only available in Bun runtime
	// biome-ignore lint/suspicious/noExplicitAny: bun:sqlite types may not be available
	const { Database } = (await import("bun:sqlite")) as any;
	const db = new Database(options.filename);

	if (options.busyTimeout) {
		db.exec(`PRAGMA busy_timeout = ${Number(options.busyTimeout)}`);
	}

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

	const query = async (sqlString: string, ...parameter: unknown[]) => {
		// bun:sqlite only accepts primitive bind values — coerce objects to JSON
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

export const bunSqliteDriver: SqliteDriver = {
	name: "bun:sqlite",
	async connect(options: SqliteDriverConnectOptions): Promise<Db> {
		return createBunSqliteConnection(options);
	},
};
/* v8 ignore stop */
