// @ts-ignore
const { Pool } = require('pg');

let pool;
let globalUri;

const pools = uri => {
	if (globalUri !== uri) {
		pool = undefined;
		globalUri = uri;
	}

	pool = pool || new Pool({ connectionString: uri });
	return pool;
};

module.exports = {
	pool: uri => pools(uri),
};
