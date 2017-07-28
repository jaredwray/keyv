import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from 'keyv-test-suite';
import Keyv from 'this';

keyvOfficialTests(test, Keyv, 'mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:1234');

const store = () => new (require('keyv-mongo'))('mongodb://127.0.0.1:27017'); // eslint-disable-line import/newline-after-import
keyvTestSuite(test, Keyv, store);
