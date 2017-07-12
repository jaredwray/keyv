import test from 'ava';
import keyvApiTests from 'keyv-api-tests';
import Keyv from 'keyv';
import KeyvRedis from '../';

const store = new KeyvRedis();
keyvApiTests(test, Keyv, store);
