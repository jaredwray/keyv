'use strict';

const test = require('ava');
const delay = require('delay');
const Keyv = require('keyv');

const KeyvSqlite = require('@keyv/sqlite');
const KeyvTiered = require('..');

const remoteStore = () => new Keyv({
	store: new KeyvSqlite({
		uri: 'sqlite://test/testdb.sqlite',
		busyTimeout: 30_000,
	}),
});

const localStore = () => new Keyv();

test.beforeEach(() => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});
	return store.clear();
});

test.serial('.set() sets to both stores', async t => {
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
	t.is(result, true);
});

test.serial('.has() returns boolean', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('foo', 'bar');

	t.is(await store.has('foo'), true);
});

test.serial('.has() checks both stores', async t => {
	const remote = remoteStore();
	const store = new KeyvTiered({remote});

	await remote.set('fizz', 'buzz');

	t.is(await store.has('fizz'), true);
});

test.serial('.delete() deletes both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.delete('fizz');

	t.is(await store.get('fizz'), undefined);
	t.is(await local.get('fizz'), undefined);
	t.is(await remote.get('fizz'), undefined);
});

test.serial(
	'.delete({ localOnly: true }) deletes only local store',
	async t => {
		const remote = remoteStore();
		const local = localStore();
		const store = new KeyvTiered({remote, local});

		await store.set('fizz', 'buzz');
		await store.delete('fizz', {localOnly: true});

		t.is(await local.get('fizz'), undefined);
		t.is(await remote.get('fizz'), 'buzz');
	},
);

test.serial('.clear() clears both stores', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.clear();

	t.is(await store.get('fizz'), undefined);
});

test.serial('.clear({ localOnly: true }) clears local store alone', async t => {
	const remote = remoteStore();
	const local = localStore();
	const store = new KeyvTiered({remote, local});

	await store.set('fizz', 'buzz');
	await store.clear({localOnly: true});

	t.is(await local.get('fizz'), undefined);
	t.is(await remote.get('fizz'), 'buzz');
});

test.serial('ttl is valid', async t => {
	const remote = remoteStore();
	const local = new Keyv({ttl: 100}); // Set local ttl
	const store = new KeyvTiered({remote, local});

	await store.set('foo', 'bar');
	await remote.set('foo', 'notbar');

	await delay(2000);
	t.is(await store.get('foo'), 'notbar');
});

test.serial('copy locally when is possible', async t => {
	const remote = remoteStore();
	const local = new Keyv();
	const store = new KeyvTiered({remote, local});

	await remote.set('foo', 'bar');

	t.is(await store.get('foo'), 'bar');
	t.is(await local.get('foo'), 'bar');
});

test.serial('custom validator', async t => {
	const remote = remoteStore();
	const local = new Keyv();
	const store = new KeyvTiered({
		remote,
		local,
		validator(value) {
			if (value.timeSensitiveData) {
				return false;
			} // Fetch from remote store only

			return true;
		},
	});

	await store.set('1', {timeSensitiveData: 'bar'});
	await store.set('2', {timeSensitiveData: false});

	t.deepEqual(await store.get('1'), {timeSensitiveData: 'bar'}); // Fetched from remote
	t.deepEqual(await store.get('2'), {timeSensitiveData: false});

	await remote.set('1', {timeSensitiveData: 'foo1'});
	await remote.set('2', {timeSensitiveData: 'foo2'}); // Set to remote so local has not been updated

	t.deepEqual(await store.get('1'), {timeSensitiveData: 'foo1'});
	t.deepEqual(await store.get('2'), {timeSensitiveData: false});
});
