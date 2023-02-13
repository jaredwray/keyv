import {promisify} from 'util';
import type {ExecutionContext, TestFn} from 'ava';
import type KeyvModule from 'keyv';

const keyvOfficialTests = (test: TestFn, Keyv: typeof KeyvModule, goodUri: string, badUri: string, options = {}) => { // eslint-disable-line max-params
	test.serial('connection string automatically requires storage adapter', async t => {
		const keyv = new Keyv(goodUri, options);
		await keyv.clear();
		t.is(await keyv.get('foo'), undefined);
		await keyv.set('foo', 'bar');
		t.is(await keyv.get('foo'), 'bar');
		await keyv.clear();
	});

	const withCallback = (fn: (t: ExecutionContext, end: () => void) => void) => async (t: ExecutionContext) => {
		await promisify(fn)(t);
	};

	test.serial('connection errors are emitted', withCallback((t: ExecutionContext, end) => {
		const keyv = new Keyv(badUri, options);
		keyv.on('error', () => {
			t.pass();
			end();
		});
	}));
};

export default keyvOfficialTests;
