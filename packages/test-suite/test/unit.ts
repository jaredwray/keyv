import test from 'ava';
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

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
keyvCompresstionTests(test, new KeyvBrotli());
