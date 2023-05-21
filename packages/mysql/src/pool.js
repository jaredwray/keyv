const mysql = require('mysql2');

let pool;
let globalUri;

const pools = (uri, options = {}) => {
	if (globalUri !== uri) {
		pool = undefined;
		globalUri = uri;
	}

	const connectObject = parseConnectionString(uri);
	const poolOptions = {...connectObject, ...options};

	pool = pool || mysql.createPool(poolOptions);
	return pool.promise();
};

const endPool = () => {
	if (pool) {
		pool.end();
	}

	globalUri = undefined;
};

function parseConnectionString(connectionString) {
	// Create a new URL object
	const url = new URL(connectionString);

	// Create the poolOptions object
	const poolOptions = {
		user: url.username,
		password: url.password || undefined,
		host: url.hostname,
		port: url.port ? Number.parseInt(url.port, 10) : undefined,
		database: url.pathname.slice(1), // Remove the leading '/'
	};

	// Remove undefined properties
	for (const key of Object.keys(poolOptions)) {
		if (poolOptions[key] === undefined) {
			delete poolOptions[key];
		}
	}

	return poolOptions;
}

module.exports = {
	pool: (uri, options) => pools(uri, options),
	endPool,
	parseConnectionString,
};
