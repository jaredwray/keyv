import {promisify} from 'util';
import {EventEmitter} from 'events';
import test, {ExecutionContext} from 'ava';
import Keyv from 'keyv';
import {keyvApiTests, keyvValueTests} from '@keyv/test-suite';
import KeyvMemcache from '../src/index';

const snooze = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Handle all the tests with listeners.
EventEmitter.setMaxListeners(200);

let uri = 'localhost:11211';

if (process.env.URI) {
	uri = process.env.URI;
}

const keyvMemcache = new KeyvMemcache(uri);

test.serial('keyv get / no expired', async t => {
	const keyv = new Keyv({store: keyvMemcache});

	await keyv.set('foo', 'bar');

	const value = await keyv.get('foo') as string;

	t.is(value, 'bar');
});

test.serial('testing defaults', t => {
	const m = new KeyvMemcache();
	t.is(m.opts.url, 'localhost:11211');
});

test.serial('keyv clear', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	await keyv.clear();
	t.is(await keyv.get('foo'), undefined);
});

test.serial('keyv get', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	await keyv.clear();
	t.is(await keyv.get('foo'), undefined);
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test('get namespace', t => {
	const keyv = new Keyv({store: keyvMemcache});
	t.is(keyvMemcache._getNamespace(), 'namespace:keyv');
});
test('format key for no namespace', t => {
	t.is(new KeyvMemcache(uri).formatKey('foo'), 'foo');
});

test('format key for namespace', t => {
	// eslint-disable-next-line no-new
	new Keyv({store: keyvMemcache});
	t.is(keyvMemcache.formatKey('foo'), 'keyv:foo');
});

test.serial('keyv get with namespace', async t => {
	const keyv1 = new Keyv({store: keyvMemcache, namespace: 'keyv1'});
	const keyv2 = new Keyv({store: keyvMemcache, namespace: '2'});

	await keyv1.set('foo', 'bar');
	t.is(await keyv1.get('foo'), 'bar');

	await keyv2.set('foo', 'bar2');
	t.is(await keyv2.get('foo'), 'bar2');
});

test.serial('keyv get / should still exist', async t => {
	const keyv = new Keyv({store: keyvMemcache});

	await keyv.set('foo-expired', 'bar-expired', 10_000);

	await snooze(2000);

	const value = await keyv.get('foo-expired') as string;

	t.is(value, 'bar-expired');
});

test.serial('keyv get / expired existing', async t => {
	const keyv = new Keyv({store: keyvMemcache});

	await keyv.set('foo-expired', 'bar-expired', 1000);

	await snooze(3000);

	const value = await keyv.get('foo-expired') as undefined;

	t.is(value, undefined);
});

test.serial('keyv get / expired existing with bad number', async t => {
	const keyv = new Keyv({store: keyvMemcache});

	await keyv.set('foo-expired', 'bar-expired', 1);

	await snooze(1000);

	const value = await keyv.get('foo-expired') as undefined;

	t.is(value, undefined);
});

test.serial('keyv get / expired', async t => {
	const keyv = new Keyv({store: keyvMemcache});

	await keyv.set('foo-expired', 'bar-expired', 1000);

	await snooze(1000);

	const value = await keyv.get('foo-expired') as undefined;

	t.is(value, undefined);
});

test.serial('keyvMemcache getMany', async t => {
	const value = await keyvMemcache.getMany(['foo0', 'Foo1']);
	t.is(Array.isArray(value), true);

	t.deepEqual(value[0], {expires: 0, value: undefined});
});

test.serial('keyv has / false', async t => {
	const keyv = new Keyv({store: new KeyvMemcache('baduri:11211')});

	const value = await keyv.has('foo');

	t.is(value, false);
});

const withCallback = (fn: (t: ExecutionContext<any>, end: () => void) => Promise<void>) => async (t: ExecutionContext<any>) => {
	await promisify(fn)(t);
};

test('clear should emit an error', withCallback(async (t: ExecutionContext<any>, end: () => void) => {
	const keyv = new Keyv({store: new KeyvMemcache('baduri:11211')});

	keyv.on('error', () => {
		t.pass();
		end();
	});

	try {
		await keyv.clear();
	} catch {}
}));

test('delete should emit an error', withCallback(async (t: ExecutionContext<any>, end: () => void) => {
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({store: new KeyvMemcache('baduri:11211', options)});

	keyv.on('error', () => {
		t.pass();
		end();
	});

	try {
		await keyv.delete('foo');
	} catch {}
}));

test('set should emit an error', withCallback(async (t: ExecutionContext<any>, end: () => void) => {
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({store: new KeyvMemcache('baduri:11211', options)});

	keyv.on('error', () => {
		t.pass();
		end();
	});

	try {
		await keyv.set('foo', 'bar');
	} catch {}
}));

test('get should emit an error', withCallback(async (t: ExecutionContext<any>, end: () => void) => {
	const options = {
		logger: {
			log() {},
		},
	};
	const keyv = new Keyv({store: new KeyvMemcache('baduri:11211', options)});

	keyv.on('error', () => {
		t.pass();
		end();
	});

	try {
		await keyv.get('foo');
	} catch {}
}));

test.serial('close connection successfully', async t => {
	const keyv = new Keyv({store: keyvMemcache});
	t.is(await keyv.get('foo'), undefined);
	await keyv.disconnect();

	/**
	 * Since the memjs library doesn't throw an error when trying to get or set on a closed connection,
   * we need to set up a "fallback" error that will occur if the operation doesn't complete within a reasonable timeframe.
	 *
	 * At least this way we can be sure that calling .disconnect() is really closing the connection
	 */
	const delayedFailure = new Promise((_, reject) => setTimeout(() => {
		reject(new Error('Operation timed out'));
	}, 3000));

	try {
		await Promise.race([keyv.get('foo'), delayedFailure]);
		t.fail();
	} catch {
		t.pass();
	}
});

const store = () => keyvMemcache;

keyvApiTests(test, Keyv, store);
keyvValueTests(test, Keyv, store);
