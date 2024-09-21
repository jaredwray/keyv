import type KeyvModule from 'keyv';
import type * as Vitest from 'vitest';
import type {KeyvStoreFn} from './types';
import keyvApiTests from './api';
import keyvValueTests from './values';
import keyvNamespaceTest from './namespace';

const keyvTestSuite = (test: typeof Vitest, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamespaceTest(test, Keyv, store);
};

export {
	keyvTestSuite as default,
};
export {default as keyvIteratorTests} from './iterator';
export {default as keyvCompresstionTests} from './compression';

export {default as keyvApiTests} from './api';
export {default as keyvValueTests} from './values';
export {default as keyvNamespaceTest} from './namespace';
export {delay} from './helper';
