const test = require('ava');
const Keyv = require('keyv');
const KeyvBrotli = require('@keyv/compress-brotli');
const keyvTestSuite = require('../src/index.js').default;
const {keyvOfficialTests, keyvIteratorTests, keyvCompresstionTests} = require('../src/index.js');

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const storeExtended = () => {
	class MapExtend extends Map {
		constructor(map, options) {
			super(map);
			this.opts = options;
		}
	}

	return new MapExtend(new Map(), {timeout: 1000});
};

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
keyvCompresstionTests(test, new KeyvBrotli());
