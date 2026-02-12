import mysql, { type Pool } from "mysql2";

let mysqlPool: Pool | undefined;
let globalUri: string | undefined;

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

export const pool = (uri: string, options = {}) => {
	if (globalUri !== uri) {
		mysqlPool = undefined;
		globalUri = uri;
	}

	const connectObject = parseConnectionString(uri);
	const poolOptions = { ...connectObject, ...options };

	mysqlPool ??= mysql.createPool(poolOptions);
	return mysqlPool.promise();
};

export const endPool = () => {
	if (mysqlPool) {
		mysqlPool.end();
	}

	globalUri = undefined;
};
