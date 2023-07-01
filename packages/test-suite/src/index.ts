import type KeyvModule from 'keyv';
import type {TestFn} from 'ava';
import type {KeyvStoreFn} from './types';
import keyvApiTests from './api';
import keyvValueTests from './values';
import keyvNamepsaceTests from './namespace';

const keyvTestSuite = (test: TestFn, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamepsaceTests(test, Keyv, store);
};

export {
	keyvTestSuite as default,
};
export {default as keyvOfficialTests} from './official';
export {default as keyvIteratorTests} from './iterator';
export {default as keyvCompresstionTests} from './compression';

export {default as keyvApiTests} from './api';
export {default as keyvValueTests} from './values';
export {default as keyvNamepsaceTests} from './namespace';
export {delay} from './helper';
