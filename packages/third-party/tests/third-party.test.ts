import * as test from 'vitest';
import {Keyv} from 'keyv';
import KeyvFile from 'keyv-file';
import QuickLRU from 'quick-lru';
import {keyvApiTests} from '@keyv/test-suite';
// @ts-expect-error - Keyv LRU doesn't have types
import {KeyvLru} from 'keyv-lru';
// @ts-expect-error - Keyv MSSQL doesn't have types
import KeyvMssql from 'keyv-mssql';

const keyvLruOptions = {
	max: 1000,
	notify: false,
	ttl: 0,
	expire: 0,
};
const keyvLru = () => new KeyvLru(keyvLruOptions);
const keyvFile = () => new KeyvFile({filename: 'keyv-file.json'});
const keyvQuickLru = () => new QuickLRU({maxSize: 1000});
const keyvMssql = () => new KeyvMssql({
	connection: {
		user: 'sa',
		password: 'YourStrong!Passw0rd',
		host: 'localhost',
	},
});

keyvApiTests(test, Keyv, keyvLru);
keyvApiTests(test, Keyv, keyvFile);
keyvApiTests(test, Keyv, keyvQuickLru);
keyvApiTests(test, Keyv, keyvMssql);
