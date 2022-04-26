const JSONbig = require('json-bigint');
const bigNumber = require('bignumber.js');

const keyvValueTests = (test, Keyv, store) => {
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
		const buf = require('buffer').Buffer.from('bar');
		await keyv.set('foo', buf);
		t.true(buf.equals(await keyv.get('foo')));
	});

	test.serial('value can be an object containing a buffer', async t => {
		const keyv = new Keyv({store: store()});
		const value = {buff: require('buffer').Buffer.from('buzz')};
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can contain quotes', async t => {
		const keyv = new Keyv({store: store()});
		const value = '"';
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), value);
	});

	test.serial('value can not be symbol', async t => {
		const keyv = new Keyv({store: store()});
		const value = Symbol('value');
		try {
			await keyv.set('foo', value);
		} catch (error) {
			t.is(error.context, 'symbol cannot be serialized');
		}
	});

	test.serial('value can be BigInt using other serializer/deserializer', async t => {
		store().opts.deserialize = JSONbig.parse;
		const keyv = new Keyv({store: store(),
			serialize: JSONbig.stringify,
			deserialize: JSONbig.parse});
		const value = BigInt('9223372036854775807');
		await keyv.set('foo', value);
		t.deepEqual(await keyv.get('foo'), bigNumber(value));
	});

	test.serial('single quotes value should be saved', async t => {
		const keyv = new Keyv({store: store()});
		// eslint-disable-next-line quotes
		let value = "'";
		await keyv.set('key', value);
		t.is(await keyv.get('key'), value);
		// eslint-disable-next-line quotes
		value = "''";
		await keyv.set('key1', value);
		t.is(await keyv.get('key1'), value);
		value = '"';
		await keyv.set('key2', value);
		t.is(await keyv.get('key2'), value);
	});

	test.serial('single quotes key should be saved', async t => {
		const keyv = new Keyv({store: store()});
		// eslint-disable-next-line quotes
		const value = "'";
		// eslint-disable-next-line quotes
		const key = "'";
		await keyv.set(key, value);
		t.is(await keyv.get(key), value);
	});

	test.after.always(async () => {
		const keyv = new Keyv({store: store()});
		await keyv.clear();
	});
};

module.exports = keyvValueTests;
