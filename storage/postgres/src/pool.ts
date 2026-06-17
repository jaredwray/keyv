import pg, { type Pool, type PoolConfig } from "pg";

/**
 * Generates a deterministic cache key from a URI and pool configuration.
 * Different configurations for the same URI produce different keys so
 * each unique (URI, config) pair gets its own pool. Option keys are sorted
 * before serialization so that key ordering does not affect the result.
 * @param uri - The PostgreSQL connection URI.
 * @param options - The pool configuration to fold into the key.
 * @returns A stable string key uniquely identifying the (URI, config) pair.
 */
function getCacheKey(uri: string, options: PoolConfig): string {
	const sortedKeys = Object.keys(options).sort();
	const sorted: Record<string, unknown> = {};
	for (const key of sortedKeys) {
		sorted[key] = (options as Record<string, unknown>)[key];
	}

	return `${uri}::${JSON.stringify(sorted)}`;
}

/**
 * Creates a manager for PostgreSQL connection pools with explicit lifecycle control.
 * Pools are shared by URI + config — multiple adapter instances connecting
 * to the same database with the same configuration reuse a single pg.Pool.
 * @returns A pool manager exposing `getPool`, `endPool`, and `endAllPools`.
 */
const createPoolManager = () => {
	const pools = new Map<string, Pool>();

	return {
		/**
		 * Returns the pool for the given URI and config, creating and caching it on first use.
		 * @param uri - The PostgreSQL connection URI.
		 * @param options - Optional pool configuration. Defaults to an empty object.
		 * @returns The shared `pg.Pool` for the (URI, config) pair.
		 */
		getPool(uri: string, options: PoolConfig = {}): Pool {
			const key = getCacheKey(uri, options);
			let existingPool = pools.get(key);
			if (!existingPool) {
				existingPool = new pg.Pool({ connectionString: uri, ...options });
				pools.set(key, existingPool);
			}

			return existingPool;
		},
		/**
		 * Ends and removes the cached pool for the given URI and config, if one exists.
		 * @param uri - The PostgreSQL connection URI.
		 * @param options - Optional pool configuration identifying the pool. Defaults to an empty object.
		 * @returns A promise that resolves once the matching pool has been closed.
		 */
		async endPool(uri: string, options: PoolConfig = {}) {
			const key = getCacheKey(uri, options);
			const existingPool = pools.get(key);
			if (existingPool) {
				await existingPool.end();
				pools.delete(key);
			}
		},
		/**
		 * Ends every cached pool and clears the cache.
		 * @returns A promise that resolves once all pools have been closed.
		 */
		async endAllPools() {
			const endings: Array<Promise<void>> = [];
			for (const [, p] of pools) {
				endings.push(p.end());
			}

			await Promise.all(endings);
			pools.clear();
		},
	};
};

const poolManager = createPoolManager();

/**
 * Gets a shared PostgreSQL connection pool for the given URI and configuration,
 * creating it on first use and reusing it for subsequent calls with the same arguments.
 * @param uri - The PostgreSQL connection URI.
 * @param options - Optional pool configuration. Defaults to an empty object.
 * @returns The shared `pg.Pool` for the (URI, config) pair.
 */
export const pool = (uri: string, options: PoolConfig = {}): Pool =>
	poolManager.getPool(uri, options);

/**
 * Ends and removes the shared pool for the given URI and configuration, if one exists.
 * @param uri - The PostgreSQL connection URI.
 * @param options - Optional pool configuration identifying the pool. Defaults to an empty object.
 * @returns A promise that resolves once the matching pool has been closed.
 */
export const endPool = async (uri: string, options: PoolConfig = {}) =>
	poolManager.endPool(uri, options);

/**
 * Ends all shared pools and clears the pool cache.
 * @returns A promise that resolves once all pools have been closed.
 */
export const endAllPools = async () => poolManager.endAllPools();
