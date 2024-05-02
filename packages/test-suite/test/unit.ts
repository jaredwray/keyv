import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvBrotli from '@keyv/compress-brotli';
import keyvTestSuite, {keyvOfficialTests, keyvIteratorTests, keyvCompresstionTests} from '../src/index';

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

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

// @ts-expect-error - KeyvStoreAdapter
keyvTestSuite(test, Keyv, storeExtended);
// @ts-expect-error - KeyvStoreAdapter
keyvIteratorTests(test, Keyv, storeExtended);
// @ts-expect-error - compression
keyvCompresstionTests(test, new KeyvBrotli());
