import type { Db } from "../types.js";
import type { SqliteDriver, SqliteDriverConnectOptions } from "./types.js";

async function createNodeSqliteConnection(
	options: SqliteDriverConnectOptions,
): Promise<Db> {
	// Dynamic import — only available on Node.js 22.5+ with --experimental-sqlite
	// biome-ignore lint/suspicious/noExplicitAny: node:sqlite types may not be available
	const { DatabaseSync } = (await import("node:sqlite")) as any;
	const db = new DatabaseSync(options.filename);

	if (options.busyTimeout) {
		db.exec(`PRAGMA busy_timeout = ${Number(options.busyTimeout)}`);
	}

	if (options.wal) {
		const isInMemory = options.filename === ":memory:";
		if (isInMemory) {
			console.warn(
				"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
			);
		} else {
			db.exec("PRAGMA journal_mode = WAL");
		}
	}

	const query = async (sqlString: string, ...parameter: unknown[]) => {
		// node:sqlite only accepts primitive bind values — coerce objects to JSON
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

export const nodeSqliteDriver: SqliteDriver = {
	name: "node:sqlite",
	async connect(options: SqliteDriverConnectOptions): Promise<Db> {
		return createNodeSqliteConnection(options);
	},
};
