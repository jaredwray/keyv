import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite from 'get-root-module';

const store = new Map();
keyvTestSuite(test, Keyv, store);
