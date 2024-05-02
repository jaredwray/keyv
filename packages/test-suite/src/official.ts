import type Vitest from 'vitest';
import type KeyvModule from 'keyv';

const keyvOfficialTests = (test: typeof Vitest, Keyv: typeof KeyvModule, goodUri: string, badUri: string, options = {}) => {
	test.it('connection string automatically requires storage adapter', async t => {
		const keyv = new Keyv(goodUri, options);
		await keyv.clear();
		t.expect(await keyv.get('foo')).toBeUndefined();
		await keyv.set('foo', 'bar');
		t.expect(await keyv.get('foo')).toBe('bar');
		await keyv.clear();
	});

	test.it('connection errors are emitted', async t => {
		const keyv = new Keyv(badUri, options);
		await new Promise<void>(resolve => keyv.on('error', () => {
			t.skip();
			resolve();
		}));
	});
};

export default keyvOfficialTests;
