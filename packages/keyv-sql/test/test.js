import test from 'ava';
import keyvTestSuite from 'keyv-test-suite';
import Keyv from 'keyv';
import KeyvSequelize from 'this';

const sqliteOpts = {
	dialect: 'sqlite',
	uri: 'sqlite://test/testdb.sqlite'
};

const store = () => new KeyvSequelize(sqliteOpts);
keyvTestSuite(test, Keyv, store);
