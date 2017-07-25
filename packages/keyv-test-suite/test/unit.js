import test from 'ava';
import Keyv from 'keyv';
import keyvTestSuite from '../';

const store = new Map();
keyvTestSuite(test, Keyv, store);
