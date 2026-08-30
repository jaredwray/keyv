import pg, { type Pool, type PoolConfig } from "pg";

type CachedPool = {
	pool: Pool;
	refs: number;
};

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
 * Each `getPool` call takes a reference; `endPool` releases one. The underlying
 * pool is closed only when the last reference is released.
 * @returns A pool manager exposing `getPool`, `endPool`, and `endAllPools`.
 */
export const createPoolManager = () => {
	const pools = new Map<string, CachedPool>();

	return {
		/**
		 * Returns the pool for the given URI and config, creating and caching it on first use.
		 * @param uri - The PostgreSQL connection URI.
		 * @param options - Optional pool configuration. Defaults to an empty object.
		 * @returns The shared `pg.Pool` for the (URI, config) pair.
		 */
		getPool(uri: string, options: PoolConfig = {}): Pool {
			const key = getCacheKey(uri, options);
			const existing = pools.get(key);
			if (existing) {
				existing.refs += 1;
				return existing.pool;
			}

			const created = new pg.Pool({ connectionString: uri, ...options });
			pools.set(key, { pool: created, refs: 1 });
			return created;
		},
		/**
		 * Releases one reference to the cached pool for the given URI and config.
		 * The pool is ended and removed only when its reference count reaches zero.
		 * @param uri - The PostgreSQL connection URI.
		 * @param options - Optional pool configuration identifying the pool. Defaults to an empty object.
		 * @returns A promise that resolves once the matching pool has been closed, or immediately
		 * if other adapters still hold a reference (or no pool exists).
		 */
		async endPool(uri: string, options: PoolConfig = {}) {
			const key = getCacheKey(uri, options);
			const existing = pools.get(key);
			if (!existing) {
				return;
			}

			existing.refs -= 1;
			if (existing.refs > 0) {
				return;
			}

			pools.delete(key);
			await existing.pool.end();
		},
		/**
		 * Ends every cached pool and clears the cache.
		 * @returns A promise that resolves once all pools have been closed.
		 */
		async endAllPools() {
			const endings: Array<Promise<void>> = [];
			for (const [, cached] of pools) {
				endings.push(cached.pool.end());
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
 * Each call takes a reference that must be released with {@link endPool}.
 * @param uri - The PostgreSQL connection URI.
 * @param options - Optional pool configuration. Defaults to an empty object.
 * @returns The shared `pg.Pool` for the (URI, config) pair.
 */
export const pool = (uri: string, options: PoolConfig = {}): Pool =>
	poolManager.getPool(uri, options);

/**
 * Releases one reference to the shared pool for the given URI and configuration.
 * The pool is closed when the last reference is released.
 * @param uri - The PostgreSQL connection URI.
 * @param options - Optional pool configuration identifying the pool. Defaults to an empty object.
 * @returns A promise that resolves once the matching pool has been closed, or immediately
 * if other adapters still hold a reference.
 */
export const endPool = async (uri: string, options: PoolConfig = {}) =>
	poolManager.endPool(uri, options);

/**
 * Ends all shared pools and clears the pool cache.
 * @returns A promise that resolves once all pools have been closed.
 */
export const endAllPools = async () => poolManager.endAllPools();
