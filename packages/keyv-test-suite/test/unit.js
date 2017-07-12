import test from 'ava';
import Keyv from 'keyv';
import keyvApiTests from '../';

const store = new Map();
keyvApiTests(test, Keyv, store);
