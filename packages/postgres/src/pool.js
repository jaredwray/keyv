const {Pool} = require('pg');

let pool;
let globalUri;

const pools = (uri, options = {}) => {
	if (globalUri !== uri) {
		pool = undefined;
		globalUri = uri;
	}

	pool = pool || new Pool({connectionString: uri, ...options});
	return pool;
};

const endPool = () => {
	pool.end();
	globalUri = undefined;
};

module.exports = {
	pool: (uri, options) => pools(uri, options),
	endPool,
};
