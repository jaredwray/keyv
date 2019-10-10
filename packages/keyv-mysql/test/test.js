import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvMysql from '..';

const {
	MYSQL_HOST = 'localhost',
	MYSQL_USER = 'mysql',
	MYSQL_PASSWORD,
	MYSQL_DATABASE = 'keyv_test'
} = process.env;

const mysqlUri = `mysql://${MYSQL_USER}${MYSQL_PASSWORD ? ':' + MYSQL_PASSWORD : ''}@${MYSQL_HOST}/${MYSQL_DATABASE}`;

keyvOfficialTests(test, Keyv, mysqlUri, 'mysql://foo');

const store = () => new KeyvMysql(mysqlUri);
keyvTestSuite(test, Keyv, store);
