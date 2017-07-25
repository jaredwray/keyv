import keyvApiTests from './api';
import keyvValueTests from './values';

const keyvTestSuite = (test, Keyv, store) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
};

export {
	keyvApiTests,
	keyvValueTests
};
export default keyvTestSuite;
