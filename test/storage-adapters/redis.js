import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'get-root-module';

keyvOfficialTests(test, Keyv, 'redis://localhost', 'redis://foo');

const store = () => new (require('keyv-redis'))('redis://localhost'); // eslint-disable-line import/newline-after-import
keyvTestSuite(test, Keyv, store);
