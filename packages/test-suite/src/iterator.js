const keyvIteratorTests = (test, Keyv, store) => {
    test.beforeEach(async () => {
		const keyv = new Keyv({ store: store() });
		await keyv.clear();
	});

    test.serial('Async Iterator test', async t => {
        const keyv = new Keyv({ store: store() });
        await keyv.set('foo', 'bar');
        const iterator = keyv.options.store.iterator();
        for await (const key of iterator) {
            console.log(key);
            t.assert(key, 'foo');
        }
    })

    test.after.always(async () => {
        const keyv = new Keyv({ store: store() });
        await keyv.clear();
    });
};

module.exports = keyvIteratorTests;