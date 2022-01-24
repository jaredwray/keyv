const keyvOfficialTests = (test, Keyv, goodUri, badUri, options = {}) => {
	test.serial('connection string automatically requires storage adapter', async t => {
		const keyv = new Keyv(goodUri, options);
		await keyv.clear();
		t.is(await keyv.get('foo'), undefined);
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
		await keyv.clear();
	});

	test.serial.cb('connection errors are emitted', t => {
		const keyv = new Keyv(badUri, options);
		keyv.on('error', () => {
			t.pass();
			t.end();
		});
	});
};

export default keyvOfficialTests;
