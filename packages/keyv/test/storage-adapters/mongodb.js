import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'this';
import KeyvMongo from '@keyv/mongo';

keyvOfficialTests(test, Keyv, 'mongodb://127.0.0.1:27017', 'mongodb://127.0.0.1:1234');

const store = () => new KeyvMongo('mongodb://127.0.0.1:27017');
keyvTestSuite(test, Keyv, store);
