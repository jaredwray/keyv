import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvPostgres from '../src/index';
import {beforeEach} from "vitest";

type MyType = {
	a: string;
};

beforeEach(async () => {
	const keyv = new Keyv({
		store: new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test'}),
	});
	await keyv.clear();
});

test.it('can specify postgres store in typescript', async t => {
	const keyv = new Keyv({
		store: new KeyvPostgres({uri: 'postgresql://postgres:postgres@localhost:5432/keyv_test'}),
	});
	t.expect(await keyv.set('testkey', {a: 'testvalue'})).toBeTruthy();
	t.expect(await keyv.get<MyType>('testkey')).toStrictEqual({a: 'testvalue'});
});
