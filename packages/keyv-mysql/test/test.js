import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvMysql from 'this';

keyvOfficialTests(test, Keyv, 'mysql://mysql@localhost/keyv_test', 'mysql://foo');

const store = () => new KeyvMysql('mysql://mysql@localhost/keyv_test');
keyvTestSuite(test, Keyv, store);
