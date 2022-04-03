const keyvApiTests = require('./api.js');
const keyvValueTests = require('./values.js');
const keyvNamepsaceTests = require('./namespace.js');
const keyvOfficialTests = require('./official.js');
const keyvIteratorTests = require('./iterator.js');

const keyvTestSuite = (test, Keyv, store) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamepsaceTests(test, Keyv, store);
};

exports.keyvApiTests = keyvApiTests;
exports.keyvValueTests = keyvValueTests;
exports.keyvNamepsaceTests = keyvNamepsaceTests;
exports.keyvOfficialTests = keyvOfficialTests;
exports.keyvIteratorTests = keyvIteratorTests;

exports.default = keyvTestSuite;
