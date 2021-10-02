const test = require('ava');
const keyvTestSuite = require('@keyv/test-suite');
const { keyvOfficialTests } = require('@keyv/test-suite');
const Keyv = require('keyv');
const KeyvRedis = require('this');
const Redis = require('ioredis');

const { REDIS_HOST = 'localhost' } = process.env;
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvRedis(redisURI);

keyvTestSuite.keyvApiTests(test, Keyv, store);
keyvTestSuite.keyvNamepsaceTests(test, Keyv, store);
keyvTestSuite.keyvValueTests(test, Keyv, store);

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
	const val = await keyv.get('foo2');
	t.true(val === undefined);
});
