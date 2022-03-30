// @ts-ignore
'use strict';

// Const { promisify } = require('util');
const test = require('ava');
const Keyv = require('keyv');
const KeyvOffline = require('this');
const KeyvRedis = require('@keyv/redis');

const keyvRedis = new KeyvRedis({
	uri: 'redis://user:pass@localhost:1337',
	maxRetriesPerRequest: 0,
});

keyvRedis.on('error', () => console.log('Connection error'));

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
	const keyv = new KeyvOffline(keyvRedis);
	const result = await keyv.set('foo', 'expires in 1 second', 1000);
	t.is(result, false);
});

test('.set return undefined if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedis);
	const result = await keyv.get('foo');
	t.is(result, undefined);
});

test('keep original keyv methods', t => {
	const keyv = new KeyvOffline(keyvRedis);
	t.is(typeof keyv.clear, 'function');
});

// Const withCallback = fn => async t => {
// 	await promisify(fn)(t);
// };
//
// test.serial('connection errors are emitted', withCallback(async (t, end) => {
// 	const keyv = new KeyvOffline(keyvRedis);
// 	keyv.on('error', () => {
// 		t.pass();
// 		end();
// 	});
// }));
