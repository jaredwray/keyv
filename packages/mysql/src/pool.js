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
	const uriRegex = /^(\w+):\/\/([\w_-]+)(?::(\w+))?@([\w.-]+)(?::(\d+))?\/(\w+)$/;

	if (!uriRegex.test(connectionString)) {
		throw new Error('Invalid connection string format');
	}

	const [, scheme, user, password, host, port, database] = connectionString.match(uriRegex);

	const poolOptions = {
		scheme,
		user,
		password: password || undefined,
		host,
		port: port ? Number.parseInt(port, 10) : undefined,
		database,
	};

	delete poolOptions.scheme;
	if (poolOptions.port === undefined) {
		delete poolOptions.port;
	}

	if (poolOptions.password === undefined) {
		delete poolOptions.password;
	}

	return poolOptions;
}

module.exports = {
	pool: (uri, options) => pools(uri, options),
	endPool,
};
