import test from 'ava';
import tk from 'timekeeper';
import keyvTestSuite, {keyvOfficialTests, keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import Redis from 'ioredis';
import KeyvRedis from '../src/index';

// eslint-disable-next-line @typescript-eslint/naming-convention
const REDIS_HOST = 'localhost';
// eslint-disable-next-line @typescript-eslint/naming-convention
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvRedis(redisURI);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.serial('reuse a redis instance', async t => {
	const redis = new Redis(redisURI);
	// @ts-expect-error foo doesn't exist on Redis
	redis.foo = 'bar';
	const keyv = new KeyvRedis(redis);
	t.is(keyv.redis.foo, 'bar');

	await keyv.set('foo', 'bar');
	const value = await redis.get('foo');
	t.true(value === 'bar');
	t.true(await keyv.get('foo') === value);
});

test.serial('set an undefined key', async t => {
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

test.serial('should support tls', async t => {
	const options = {tls: {rejectUnauthorized: false}};
	const redis = new Redis('rediss://localhost:6380', options);
	const keyvRedis = new KeyvRedis(redis);
	await keyvRedis.set('foo', 'bar');
	t.true(await keyvRedis.get('foo') === 'bar');
});

test.serial('close tls connection successfully', async t => {
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

test.serial('.clear cleaned namespace', async t => {
	// Setup
	const keyv = new Keyv(redisURI, {
		adapter: 'redis',
		namespace: 'v3',
	});

	const length = 1;
	const key = [...Array.from({length}).keys()].join('');

	await keyv.set(key, 'value', 1);

	await new Promise(r => {
		setTimeout(r, 250);
	});

	await keyv.clear();
	await keyv.disconnect();

	// Test
	const redis = new Redis(redisURI);

	// Namespace should also expire after calling clear
	t.true(await redis.exists('namespace:v3') === 0);

	// Memory of each key should be null
	t.true(await redis.memory('USAGE', 'namespace:v3') === null);
});

test.serial('Keyv stores ttl without const', async t => {
	const keyv = new Keyv(redisURI);
	await keyv.set('foo', 'bar', 100);
	t.is(await keyv.get('foo'), 'bar');
	tk.freeze(Date.now() + 150);
	t.is(await keyv.get('foo'), undefined);
});

test.serial('should handle KeyvOptions without uri', t => {
	const options = {
		isCluster: true,
	};
	const keyv = new KeyvRedis(options);
	t.true(keyv.redis instanceof Redis);
});
