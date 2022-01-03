/* eslint-disable unicorn/prefer-export-from */
import keyvApiTests from './api.js';
import keyvValueTests from './values.js';
import keyvNamepsaceTests from './namespace.js';
import keyvOfficialTests from './official.js';

const keyvTestSuite = (test, Keyv, store) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamepsaceTests(test, Keyv, store);
};

export {
	keyvApiTests,
	keyvValueTests,
	keyvNamepsaceTests,
	keyvOfficialTests,
};

export default keyvTestSuite;
