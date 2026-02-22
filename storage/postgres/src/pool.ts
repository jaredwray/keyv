import pg, { type Pool, type PoolConfig } from "pg";

const pools = new Map<string, Pool>();

export const pool = (uri: string, options: PoolConfig = {}): Pool => {
	let existingPool = pools.get(uri);
	if (!existingPool) {
		existingPool = new pg.Pool({ connectionString: uri, ...options });
		pools.set(uri, existingPool);
	}

	return existingPool;
};

export const endPool = async (uri: string) => {
	const existingPool = pools.get(uri);
	if (existingPool) {
		await existingPool.end();
		pools.delete(uri);
	}
};
