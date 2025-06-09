import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvBrotli from '@keyv/compress-brotli';
import keyvTestSuite, {keyvIteratorTests, keyvCompresstionTests} from '../src/index.js';

const storeExtended = () => {
	class MapExtend extends Map {
		private readonly opts: {timeout: number};
		constructor(map: Map<any, any>, options: {timeout: number}) {
			// @ts-expect-error - super don't accept arguments
			super(map);
			this.opts = options;
		}
	}

	return new MapExtend(new Map(), {timeout: 1000});
};

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
// @ts-expect-error - compression
keyvCompresstionTests(test, new KeyvBrotli());
