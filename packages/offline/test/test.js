// @ts-ignore
'use strict';

const test = require('ava');
const Keyv = require('keyv');
const KeyvOffline = require('this');
const KeyvRedis = require('@keyv/redis');
const keyvTestSuite = require('@keyv/test-suite').default;
const { keyvOfficialTests } = require('@keyv/test-suite');

const keyvRedisBad = new KeyvRedis({
	uri: 'redis://user:pass@localhost:1338',
	maxRetriesPerRequest: 0,
	emitErrors: false,
});

keyvRedisBad.on('error', () => console.log('Connection error'));

test('.set return true under normal behavior', async t => {
	const store = new Map();
	const keyv = new KeyvOffline(new Keyv({ store }));
	const result = await keyv.set('foo', 'expires in 1 second', 1000);
	t.is(result, true);
});

test('.get return the expected value under normal behavior', async t => {
	const store = new Map();
	const keyv = new KeyvOffline(new Keyv({ store }));
	await keyv.set('foo', 'bar');
	t.is(await keyv.get('foo'), 'bar');
});

test('.set return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	const result = await keyv.set('foo', 'expires in 1 second', 1000);
	t.is(result, false);
});

test('.set return undefined if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	const result = await keyv.get('foo');
	t.is(result, undefined);
});

test('.clear return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	t.is(await keyv.clear(), false);
	t.is(typeof keyv.clear, 'function');
});

test('.delete return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	t.is(await keyv.delete(), false);
	t.is(typeof keyv.delete, 'function');
});

test('.getMany return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	t.is(await keyv.getMany(), false);
	t.is(typeof keyv.getMany, 'function');
});

test('.has return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	t.is(await keyv.has(), false);
	t.is(typeof keyv.has, 'function');
});

const REDIS_HOST = 'localhost';
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvOffline(new KeyvRedis(redisURI));

keyvTestSuite(test, Keyv, store);

