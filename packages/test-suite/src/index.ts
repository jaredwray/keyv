import type KeyvModule from 'keyv';
import type * as Vitest from 'vitest';
import type {KeyvStoreFn} from './types.js';
import keyvApiTests from './api.js';
import keyvValueTests from './values.js';
import keyvNamespaceTest from './namespace.js';

const keyvTestSuite = (test: typeof Vitest, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	keyvApiTests(test, Keyv, store);
	keyvValueTests(test, Keyv, store);
	keyvNamespaceTest(test, Keyv, store);
};

export default keyvTestSuite;

export {default as keyvIteratorTests} from './iterator.js';
export {default as keyvCompresstionTests} from './compression.js';

export {default as keyvApiTests} from './api.js';
export {default as keyvValueTests} from './values.js';
export {default as keyvNamespaceTest} from './namespace.js';
export {delay} from './helper.js';
