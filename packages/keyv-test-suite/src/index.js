import keyvApiTests from './api';
import keyvValueTests from './values';
import keyvNamepsaceTests from './namespace';
import keyvOfficialTests from './official';

const keyvTestSuite = (test, Keyv, store) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamepsaceTests(test, Keyv, store);
};

export {
	keyvApiTests,
	keyvValueTests,
	keyvNamepsaceTests,
	keyvOfficialTests
};
export default keyvTestSuite;
