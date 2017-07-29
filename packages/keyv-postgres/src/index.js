'use strict';

const KeyvSequelize = require('keyv-sequelize');

class KeyvPostgres extends KeyvSequelize {
	constructor(opts) {
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		opts = Object.assign({
			dialect: 'postgres',
			uri: 'postgresql://localhost:5432'
		}, opts);

		super(opts);
	}
}

module.exports = KeyvPostgres;
