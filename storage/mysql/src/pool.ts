import mysql, { type PoolOptions } from "mysql2";

export const parseConnectionString = (connectionString: string) => {
	// Handle # character as URL breaks when it is present
	connectionString = connectionString.replace(/#/g, "%23");
	// Create a new URL object
	const url = new URL(connectionString);

	// Create the poolOptions object
	const poolOptions = {
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password) || undefined,
		host: url.hostname,
		port: url.port ? Number.parseInt(url.port, 10) : undefined,
		database: decodeURIComponent(url.pathname.slice(1)), // Remove the leading '/'
	};

	// Remove undefined properties
	for (const key of Object.keys(poolOptions)) {
		// @ts-expect-error - poolOptions
		if (poolOptions[key] === undefined) {
			//  @ts-expect-error
			delete poolOptions[key];
		}
	}

	return poolOptions;
};

/** Creates a new mysql2 connection pool for a single adapter instance. */
export const createPool = (uri: string, options: PoolOptions = {}) => {
	const connectObject = parseConnectionString(uri);
	return mysql.createPool({ ...connectObject, ...options }).promise();
};
