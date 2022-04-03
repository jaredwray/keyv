const {promisify} = require('util');

const keyvOfficialTests = (test, Keyv, goodUri, badUri, options = {}) => { // eslint-disable-line max-params
	test.serial('connection string automatically requires storage adapter', async t => {
		const keyv = new Keyv(goodUri, options);
		await keyv.clear();
		t.is(await keyv.get('foo'), undefined);
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
		await keyv.clear();
	});

	const withCallback = fn => async t => {
		await promisify(fn)(t);
	};

	test.serial('connection errors are emitted', withCallback((t, end) => {
		const keyv = new Keyv(badUri, options);
		keyv.on('error', () => {
			t.pass();
			end();
		});
	}));
};

module.exports = keyvOfficialTests;
