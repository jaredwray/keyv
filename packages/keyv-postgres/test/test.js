import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvPostgres from '..';

const {
	POSTGRES_HOST = 'localhost',
	POSTGRES_USER = 'postgres',
	POSTGRES_PASSWORD,
	POSTGRES_DB = 'keyv_test'
} = process.env;

const postgresUri = `postgresql://${POSTGRES_USER}${POSTGRES_PASSWORD ? ':' + POSTGRES_PASSWORD : ''}@${POSTGRES_HOST}:5432/${POSTGRES_DB}`;

keyvOfficialTests(test, Keyv, postgresUri, 'postgresql://foo');

const store = () => new KeyvPostgres({ uri: postgresUri });
keyvTestSuite(test, Keyv, store);
