'use strict';

const KeyvSequelize = require('keyv-sequelize');

class KeyvSqlite extends KeyvSequelize {
	constructor(opts) {
		opts = opts || {};
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		opts = Object.assign({
			dialect: 'sqlite',
			uri: 'sqlite://:memory:',
			table: 'keyv',
			logging: false
		}, opts);

		super(opts);
	}
}

module.exports = KeyvSqlite;
