import testStore from 'keyv/test/helpers/test-store';
import KeyvRedis from '../';

const store = new KeyvRedis();
testStore(store);
