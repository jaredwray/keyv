import type { DbQuery } from "../types.js";

/**
 * Coerces bind parameters for SQLite drivers. Non-primitive values (objects)
 * are serialized to JSON strings since SQLite drivers only accept primitives.
 * @param params - The raw parameters to coerce.
 * @returns An array of primitive-safe parameters.
 */
export function coerceParams(params: unknown[]): unknown[] {
	return params.map((p) =>
		p !== null && typeof p === "object" ? JSON.stringify(p) : p,
	);
}

/**
 * Checks whether a SQL statement should return rows.
 * Matches SELECT, PRAGMA, and any statement containing a RETURNING clause.
 */
export function isReturningQuery(trimmedUpperSql: string): boolean {
	return (
		trimmedUpperSql.startsWith("SELECT") ||
		trimmedUpperSql.startsWith("PRAGMA") ||
		/\bRETURNING\b/.test(trimmedUpperSql)
	);
}

/**
 * Creates a standard query function that dispatches to the appropriate
 * method based on the SQL command type (SELECT/PRAGMA/RETURNING vs mutations).
 * @param allFn - Function to execute read queries (SELECT, PRAGMA, RETURNING) that return rows.
 * @param runFn - Function to execute mutation queries (INSERT, UPDATE, DELETE).
 * @returns A {@link DbQuery} function.
 */
export function createQueryFn(
	allFn: (sql: string, params: unknown[]) => unknown[] | Promise<unknown[]>,
	runFn: (sql: string, params: unknown[]) => void | Promise<void>,
): DbQuery {
	return async (sqlString: string, ...parameter: unknown[]) => {
		const safeParams = coerceParams(parameter);
		const trimmed = sqlString.trimStart().toUpperCase();
		if (isReturningQuery(trimmed)) {
			return allFn(sqlString, safeParams);
		}

		await runFn(sqlString, safeParams);
		return [];
	};
}

/**
 * Checks if WAL mode should be applied and logs a warning for in-memory databases.
 * Returns `true` if WAL mode should be enabled, `false` otherwise.
 * @param filename - The database filename.
 * @param wal - Whether WAL mode is requested.
 * @returns `true` if WAL mode should be applied.
 */
export function shouldApplyWal(filename: string, wal?: boolean): boolean {
	if (!wal) {
		return false;
	}

	if (filename === ":memory:") {
		console.warn(
			"@keyv/sqlite: WAL mode is not supported for in-memory databases. The wal option will be ignored.",
		);
		return false;
	}

	return true;
}
