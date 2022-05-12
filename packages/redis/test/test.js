const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite').default;
const {keyvOfficialTests, keyvIteratorTests} = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvRedis = require('this');
const Redis = require('ioredis');

const REDIS_HOST = 'localhost';
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvRedis(redisURI);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test('reuse a redis instance', async t => {
	const redis = new Redis(redisURI);
	redis.foo = 'bar';
	const keyv = new KeyvRedis(redis);
	t.is(keyv.redis.foo, 'bar');

	await keyv.set('foo', 'bar');
	const value = await redis.get('foo');
	t.true(value === 'bar');
	t.true(await keyv.get('foo') === value);
});

test('set an undefined key', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);

	await keyv.set('foo2', undefined);
	const result = await keyv.get('foo2');
	t.true(result === undefined);
});

test.serial('Async Iterator 0 element test', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);
	await keyv.clear();
	const iterator = keyv.iterator('keyv');
	const key = await iterator.next();
	t.is(key.value, undefined);
});

test.serial('close connection successfully', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);
	t.is(await keyv.get('foo'), undefined);
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.fail();
	} catch {
		t.pass();
	}
});

test('should support tls', async t => {
	const options = {tls: {rejectUnauthorized: false}};
	const redis = new Redis('rediss://localhost:6380', options);
	const keyvRedis = new KeyvRedis(redis);
	await keyvRedis.set('foo', 'bar');
	t.true(await keyvRedis.get('foo') === 'bar');
});

test('close tls connection successfully', async t => {
	const options = {tls: {rejectUnauthorized: false}};
	const redis = new Redis('rediss://localhost:6380', options);
	const keyvRedis = new KeyvRedis(redis);
	t.is(await keyvRedis.get('foo5'), undefined);
	await keyvRedis.disconnect();
	try {
		await keyvRedis.get('foo5');
		t.fail();
	} catch {
		t.pass();
	}
});
