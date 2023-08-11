import {Pool, type PoolConfig} from 'pg';

let postgresPool: Pool | undefined;
let globalUri: string | undefined;

export const pool = (uri: string, options: PoolConfig = {}) => {
	if (globalUri !== uri) {
		postgresPool = undefined;
		globalUri = uri;
	}

	postgresPool = postgresPool ?? new Pool({connectionString: uri, ...options});
	return postgresPool;
};

export const endPool = async () => {
	await postgresPool!.end();
	globalUri = undefined;
};
