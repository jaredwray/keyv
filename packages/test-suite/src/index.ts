import type KeyvModule from 'keyv';
import type {TestFn} from 'ava';
import type {KeyvStoreFn} from './types.js';

import keyvApiTests from './api.js';
import keyvValueTests from './values.js';
import keyvNamepsaceTests from './namespace.js';

const keyvTestSuite = (test: TestFn, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamepsaceTests(test, Keyv, store);
};

export {
	keyvTestSuite as default,
};
export {default as keyvOfficialTests} from './official.js';
export {default as keyvIteratorTests} from './iterator.js';
export {default as keyvCompresstionTests} from './compression.js';

export {default as keyvApiTests} from './api.js';
export {default as keyvValueTests} from './values.js';
export {default as keyvNamepsaceTests} from './namespace.js';
