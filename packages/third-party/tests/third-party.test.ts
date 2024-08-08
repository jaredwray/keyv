import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvFile from 'keyv-file';
import QuickLRU from 'quick-lru';
// @ts-expect-error - Keyv Dynamo doesn't have types
import KeyvDynamo from 'keyv-dynamodb';
import {keyvApiTests} from '@keyv/test-suite';

const keyvFile = () => new KeyvFile({filename: 'keyv-file.json'});
const keyvLru = () => new QuickLRU({maxSize: 1000});
const keyvDynamoDatabase = () => new KeyvDynamo({
	clientOptions: {
		region: 'us-east-1',
		secretAccessKey: 'demo',
		accessKeyId: 'demo',
	},
});

keyvApiTests(test, Keyv, keyvFile as any);
keyvApiTests(test, Keyv, keyvLru as any);
keyvApiTests(test, Keyv, keyvDynamoDatabase as any);

