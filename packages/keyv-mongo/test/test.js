import test from 'ava';
import keyvApiTests from 'keyv-api-tests';
import Keyv from 'keyv';
import KeyvMongo from '../';

const store = new KeyvMongo();
keyvApiTests(test, Keyv, store);
