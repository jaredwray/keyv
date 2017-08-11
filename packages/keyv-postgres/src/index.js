'use strict';

const KeyvSql = require('@keyv/sql');
const Pool = require('pg').Pool;

class KeyvPostgres extends KeyvSql {
	constructor(opts) {
		opts = Object.assign({
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432'
		}, opts);

		opts.connect = () => Promise.resolve()
			.then(() => {
				const pool = new Pool({ connectionString: opts.uri });
				return sql => pool.query(sql)
					.then(data => data.rows);
			});

		super(opts);
	}
}

module.exports = KeyvPostgres;
