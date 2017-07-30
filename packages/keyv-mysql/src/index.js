'use strict';

const KeyvSequelize = require('keyv-sequelize');

class KeyvMysql extends KeyvSequelize {
	constructor(opts) {
		if (typeof opts === 'string') {
			opts = { uri: opts };
		}
		opts = Object.assign({
			dialect: 'mysql',
			uri: 'mysql://localhost'
		}, opts);

		super(opts);
	}
}

module.exports = KeyvMysql;
