import pg, { type Pool, type PoolConfig } from "pg";

/**
 * Manages PostgreSQL connection pools with explicit lifecycle control.
 * Pools are shared by URI — multiple adapter instances connecting to the
 * same database reuse a single underlying pg.Pool.
 */
const createPoolManager = () => {
	const pools = new Map<string, Pool>();

	return {
		getPool(uri: string, options: PoolConfig = {}): Pool {
			let existingPool = pools.get(uri);
			if (!existingPool) {
				existingPool = new pg.Pool({ connectionString: uri, ...options });
				pools.set(uri, existingPool);
			}

			return existingPool;
		},
		async endPool(uri: string) {
			const existingPool = pools.get(uri);
			if (existingPool) {
				await existingPool.end();
				pools.delete(uri);
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

export const endPool = async (uri: string) => poolManager.endPool(uri);

export const endAllPools = async () => poolManager.endAllPools();
