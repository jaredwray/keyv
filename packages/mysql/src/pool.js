const mysql = require('mysql2');

let pool;
let globalUri;

const pools = (uri, options = {}) => {
	if (globalUri !== uri) {
		pool = undefined;
		globalUri = uri;
	}

	pool = pool || mysql.createPool({uri, ...options});
	return pool.promise();
};

const endPool = () => {
	if (pool) {
		pool.end();
	}

	globalUri = undefined;
};

module.exports = {
	pool: (uri, options) => pools(uri, options),
	endPool,
};
