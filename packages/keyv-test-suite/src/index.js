import keyvApiTests from './api';
import keyvValueTests from './values';
import keyvOfficialTests from './official';

const keyvTestSuite = (test, Keyv, store) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
};

export {
	keyvApiTests,
	keyvValueTests,
	keyvOfficialTests
};
export default keyvTestSuite;
