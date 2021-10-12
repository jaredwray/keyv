'use strict';

const KeyvSql = require('@keyv/sql');
const Pool = require('pg').Pool;

class KeyvPostgres extends KeyvSql {
	constructor(options) {
		options = Object.assign({
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432',
		}, options);

		options.connect = () => Promise.resolve()
			.then(() => {
				const pool = new Pool({ connectionString: options.uri });
				return sql => pool.query(sql)
					.then(data => data.rows);
			});

		super(options);
	}
}

module.exports = KeyvPostgres;
