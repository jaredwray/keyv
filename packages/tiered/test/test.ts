import * as test from 'vitest';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import keyvTestSuite, {delay, keyvIteratorTests, keyvOfficialTests} from '@keyv/test-suite';
import KeyvTiered from '../src/index';

keyvOfficialTests(test, Keyv, 'sqlite://test/testdb.sqlite', 'sqlite://non/existent/database.sqlite');

const remoteStore = () => new Keyv({
	store: new KeyvSqlite({
		uri: 'sqlite://test/testdb.sqlite',
		busyTimeout: 30_000,
	}),
});

const localStore = () => new Keyv();
const store = () => new KeyvTiered({remote: remoteStore(), local: localStore()});

// @ts-expect-error - Store
keyvTestSuite(test, Keyv, store);

// @ts-expect-error - Store
keyvIteratorTests(test, Keyv, store);

test.beforeEach(async () => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});
	await store.clear();
});

test.it('constructor on default', t => {
	// @ts-expect-error - KeyvTiered needs constructor options
	const store = new KeyvTiered({});
	t.expect(store.local.opts.store).toBeTruthy();
	t.expect(store.remote.opts.store).toBeTruthy();
});

test.it('.set() sets to both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('foo', 'bar');

	const [remoteResult, localResult, storeResult] = await Promise.all([
		remote.get('foo'),
		store.get('foo'),
		local.get('foo'),
	]);
	const result = remoteResult === localResult && storeResult === localResult; // Check equality as 'bar' is just a string
	t.expect(result).toBeTruthy();
});

test.it('.has() returns boolean', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('foo', 'bar');

	t.expect(await store.has('foo')).toBeTruthy();
});

test.it('.has() checks both stores', async t => {
	const remote = remoteStore();
	// @ts-expect-error - KeyvTiered needs local
	const store = new KeyvTiered({remote});

	await remote.set('fizz', 'buzz');

	t.expect(await store.has('fizz')).toBeTruthy();
});

test.it('.delete() deletes both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.delete('fizz');

	t.expect(await store.get('fizz')).toBeUndefined();
	t.expect(await local.get('fizz')).toBeUndefined();
	t.expect(await remote.get('fizz')).toBeUndefined();
});

test.it('.deleteMany() deletes both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.set('fizz1', 'buzz1');
	const value = await store.deleteMany(['fizz', 'fizz1']);

	t.expect(value).toBeTruthy();
	t.expect(await store.get('fizz')).toBeUndefined();
	t.expect(await local.get('fizz')).toBeUndefined();
	t.expect(await remote.get('fizz')).toBeUndefined();
	t.expect(await store.get('fizz1')).toBeUndefined();
	t.expect(await local.get('fizz1')).toBeUndefined();
	t.expect(await remote.get('fizz1')).toBeUndefined();
});

test.it('.getMany() deletes both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.set('fizz1', 'buzz1');
	let value = await store.getMany(['fizz', 'fizz1']);
	t.expect(value).toStrictEqual(['buzz', 'buzz1']);

	value = await store.getMany(['fizz3', 'fizz4']);
	t.expect(value).toStrictEqual([undefined, undefined]);
});

test.it(
	'.delete({ localOnly: true }) deletes only local store',
	async t => {
		const remote = remoteStore();
		const local = localStore();
		const store = new KeyvTiered({remote, local, localOnly: true});

		await store.set('fizz', 'buzz');
		await store.delete('fizz');

		t.expect(await local.get('fizz')).toBeUndefined();
		t.expect(await remote.get('fizz')).toBeTruthy();
	},
);

test.it('.clear() clears both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.clear();

	t.expect(await store.get('fizz')).toBeUndefined();
});

test.it('.clear({ localOnly: true }) clears local store alone', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local, localOnly: true});

	await store.set('fizz', 'buzz');
	await store.clear();

	t.expect(await local.get('fizz')).toBeUndefined();
	t.expect(await remote.get('fizz')).toBeTruthy();
});

test.it('ttl is valid', async t => {
	const remote = remoteStore();
	const local = new Keyv({ttl: 100}); // Set local ttl
	const store = new KeyvTiered({remote, local});

	await store.set('foo', 'bar');
	await remote.set('foo', 'notbar');

	await delay(2000);
	t.expect(await store.get('foo')).toBe('notbar');
});

test.it('copy locally when is possible', async t => {
	const remote = remoteStore();
	const local = new Keyv();
	const store = new KeyvTiered({remote, local});

	await remote.set('foo', 'bar');

	t.expect(await store.get('foo')).toBe('bar');
	t.expect(await local.get('foo')).toBe('bar');
});

test.it('custom validator', async t => {
	const remote = remoteStore();
	const local = new Keyv();
	const store = new KeyvTiered({
		remote,
		local,
		// @ts-expect-error - Validator not need params
		validator(value: {timeSensitiveData: any}) {
			if (value.timeSensitiveData) {
				return false;
			} // Fetch from remote store only

			return true;
		},
	});

	await store.set('1', {timeSensitiveData: 'bar'});
	await store.set('2', {timeSensitiveData: false});

	t.expect(await store.get('1')).toStrictEqual({timeSensitiveData: 'bar'}); // Fetched from remote
	t.expect(await store.get('2')).toStrictEqual({timeSensitiveData: false});

	await remote.set('1', {timeSensitiveData: 'foo1'});
	await remote.set('2', {timeSensitiveData: 'foo2'}); // Set to remote so local has not been updated

	t.expect(await store.get('1')).toStrictEqual({timeSensitiveData: 'foo1'});
	t.expect(await store.get('2')).toStrictEqual({timeSensitiveData: false});
});
