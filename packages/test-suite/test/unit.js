const test = require('ava');
// Const Keyv = require('keyv');
// const keyvTestSuite = require('this').default;
const {keyvCompresstionTests} = require('this');
const KeyvBrotli = require('../../compress-brotli/src/index.js');

// KeyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

// const storeExtended = () => {
// 	class MapExtend extends Map {
// 		constructor(map, options) {
// 			super(map);
// 			this.opts = options;
// 		}
// 	}

// 	return new MapExtend(new Map(), {timeout: 1000});
// };

// keyvTestSuite(test, Keyv, storeExtended);
// keyvIteratorTests(test, Keyv, storeExtended);
keyvCompresstionTests(test, new KeyvBrotli());
