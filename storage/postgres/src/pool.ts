import pg, { type Pool, type PoolConfig } from "pg";

/**
 * Generates a deterministic cache key from a URI and pool configuration.
 * Different configurations for the same URI produce different keys so
 * each unique (URI, config) pair gets its own pool.
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
 * Manages PostgreSQL connection pools with explicit lifecycle control.
 * Pools are shared by URI + config — multiple adapter instances connecting
 * to the same database with the same configuration reuse a single pg.Pool.
 */
const createPoolManager = () => {
	const pools = new Map<string, Pool>();

	return {
		getPool(uri: string, options: PoolConfig = {}): Pool {
			const key = getCacheKey(uri, options);
			let existingPool = pools.get(key);
			if (!existingPool) {
				existingPool = new pg.Pool({ connectionString: uri, ...options });
				pools.set(key, existingPool);
			}

			return existingPool;
		},
		async endPool(uri: string, options: PoolConfig = {}) {
			const key = getCacheKey(uri, options);
			const existingPool = pools.get(key);
			if (existingPool) {
				await existingPool.end();
				pools.delete(key);
			}
		},
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

export const pool = (uri: string, options: PoolConfig = {}): Pool =>
	poolManager.getPool(uri, options);

export const endPool = async (uri: string, options: PoolConfig = {}) =>
	poolManager.endPool(uri, options);

export const endAllPools = async () => poolManager.endAllPools();
