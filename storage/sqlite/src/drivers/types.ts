import type { Db } from "../types.js";

export type SqliteDriverName = "better-sqlite3" | "node:sqlite" | "bun:sqlite";

export type SqliteDriverConnectOptions = {
	filename: string;
	busyTimeout?: number;
	wal?: boolean;
};

export type SqliteDriver = {
	name: SqliteDriverName;
	connect(options: SqliteDriverConnectOptions): Promise<Db>;
};
