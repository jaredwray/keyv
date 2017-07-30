'use strict';

const KeyvSql = require('keyv-sql');
const { Pool } = require('pg');

class KeyvPostgres extends KeyvSql {
	constructor(opts) {
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		opts = Object.assign({
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432'
		}, opts);

		opts.connect = () => Promise.resolve()
			.then(() => {
				const pool = new Pool({ connectionString: opts.uri });
				return pool.query.bind(pool);
			});

		super(opts);
	}
}

module.exports = KeyvPostgres;
