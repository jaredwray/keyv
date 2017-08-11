'use strict';

const KeyvSql = require('@keyv/sql');
const mysql = require('mysql2/promise');

class KeyvMysql extends KeyvSql {
	constructor(opts) {
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		opts = Object.assign({
			dialect: 'mysql',
			uri: 'mysql://localhost'
		}, opts);

		opts.connect = () => Promise.resolve()
			.then(() => mysql.createConnection(opts.uri))
			.then(connection => {
				return sql => connection.execute(sql)
					.then(data => data[0]);
			});

		super(opts);
	}
}

module.exports = KeyvMysql;
