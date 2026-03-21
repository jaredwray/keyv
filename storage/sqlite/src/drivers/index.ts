import type { SqliteDriver, SqliteDriverName } from "./types.js";

async function loadDriver(name: SqliteDriverName): Promise<SqliteDriver> {
	switch (name) {
		case "better-sqlite3": {
			const { betterSqlite3Driver } = await import(
				"./better-sqlite3-driver.js"
			);
			return betterSqlite3Driver;
		}

		case "node:sqlite": {
			// Probe that the built-in module exists before returning the driver
			await import("node:sqlite");
			const { nodeSqliteDriver } = await import("./node-sqlite-driver.js");
			return nodeSqliteDriver;
		}

		/* v8 ignore next 5 -- @preserve: bun:sqlite only available in Bun runtime */
		case "bun:sqlite": {
			// Probe that the built-in module exists before returning the driver
			// @ts-expect-error
			await import("bun:sqlite");
			const { bunSqliteDriver } = await import("./bun-sqlite-driver.js");
			return bunSqliteDriver;
		}

		default: {
			throw new Error(`Unknown SQLite driver: ${name as string}`);
		}
	}
}

// biome-ignore lint/suspicious/noExplicitAny: Bun global detection
declare const Bun: any;

/**
 * Resolves which SQLite driver to use.
 *
 * - If `preferred` is a {@link SqliteDriver} object, it is returned directly.
 * - If `preferred` is a driver name string, that specific driver is loaded (throws if unavailable).
 * - If `preferred` is omitted, auto-detection tries drivers in priority order:
 *   - **Bun**: `bun:sqlite` then `better-sqlite3`
 *   - **Node.js**: `node:sqlite` then `better-sqlite3`
 */
export async function resolveDriver(
	preferred?: SqliteDriverName | SqliteDriver,
): Promise<SqliteDriver> {
	// Custom driver object — return directly
	if (
		preferred !== undefined &&
		typeof preferred === "object" &&
		"connect" in preferred
	) {
		return preferred;
	}

	// Explicit driver name — load or fail
	if (typeof preferred === "string") {
		try {
			return await loadDriver(preferred);
		} catch (error) {
			throw new Error(
				`Failed to load SQLite driver "${preferred}": ${(error as Error).message}`,
			);
		}
	}

	// Auto-detect based on runtime
	const isBun = typeof Bun !== "undefined";
	/* v8 ignore next -- @preserve: Bun runtime branch */
	const candidates: SqliteDriverName[] = isBun
		? ["bun:sqlite", "better-sqlite3"]
		: ["node:sqlite", "better-sqlite3"];

	for (const name of candidates) {
		try {
			return await loadDriver(name);
		} catch {
			// Driver not available, try next
		}
	}

	/* v8 ignore next 3 -- @preserve */
	throw new Error(
		"No SQLite driver found. Install better-sqlite3: npm install better-sqlite3",
	);
}
