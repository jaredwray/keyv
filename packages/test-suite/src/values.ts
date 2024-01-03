import {Buffer} from 'buffer';
import type {TestFn} from 'ava';
import type KeyvModule from 'keyv';
import JSONbig from 'json-bigint';
import {BigNumber} from 'bignumber.js';
import type {KeyvStoreFn} from './types';

const keyvValueTests = (test: TestFn, Keyv: typeof KeyvModule, store: KeyvStoreFn) => {
	test.beforeEach(async () => {
		const keyv = new Keyv({store: store()});
		await keyv.clear();
	});

	test.serial('value can be false', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', false);
		t.is(await keyv.get('foo'), false);
	});

	test.serial('value can be null', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', null);
		t.is(await keyv.get('foo'), null);
	});

	test.serial('value can be undefined', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', undefined);
		t.is(await keyv.get('foo'), undefined);
	});

	test.serial('value can be a number', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 0);
		t.is(await keyv.get('foo'), 0);
	});

	test.serial('value can be an object', async t => {
		const keyv = new Keyv({store: store()});
		const value = {fizz: 'buzz'};
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can be a buffer', async t => {
		const keyv = new Keyv({store: store()});
		const buf = Buffer.from('bar');
		await keyv.set('foo', buf);
		t.true(buf.equals(await keyv.get('foo')));
	});

	test.serial('value can be an object containing a buffer', async t => {
		const keyv = new Keyv({store: store()});
		const value = {buff: Buffer.from('buzz')};
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can contain quotes', async t => {
		const keyv = new Keyv({store: store()});
		const value = '"';
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can be a string', async t => {
		const keyv = new Keyv({store: store()});
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
	});

	test.serial('value can not be symbol', async t => {
		const keyv = new Keyv({store: store()});
		const value = Symbol('value');

		const error = await (new Promise(resolve => {
			keyv.set('foo', value).catch(error => {
				resolve(error.context);
			});
		}));
		t.is(error, 'symbol cannot be serialized');
	});

	test.serial('value can be BigInt using other serializer/deserializer', async t => {
		// @ts-expect-error TS doesn't know that store().opts is a KeyvStoreOpts
		store().opts.deserialize = JSONbig.parse;
		const keyv = new Keyv({store: store(),
			serialize: JSONbig.stringify,
			deserialize: JSONbig.parse});
		const value = BigInt('9223372036854775807') as unknown as BigNumber.Value;
		await keyv.set('foo', value);
		// eslint-disable-next-line new-cap
		t.deepEqual(await keyv.get('foo'), BigNumber(value));
	});

	test.serial('single quotes value should be saved', async t => {
		const keyv = new Keyv({store: store()});

		let value = '\'';
		await keyv.set('key', value);
		t.is(await keyv.get('key'), value);

		value = '\'\'';
		await keyv.set('key1', value);
		t.is(await keyv.get('key1'), value);
		value = '"';
		await keyv.set('key2', value);
		t.is(await keyv.get('key2'), value);
	});

	test.serial('single quotes key should be saved', async t => {
		const keyv = new Keyv({store: store()});

		const value = '\'';

		const key = '\'';
		await keyv.set(key, value);
		t.is(await keyv.get(key), value);
	});

	test.after.always(async () => {
		const keyv = new Keyv({store: store()});
		await keyv.clear();
	});
};

export default keyvValueTests;
