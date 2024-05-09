import * as test from 'vitest';
import tk from 'timekeeper';
import keyvTestSuite, {keyvIteratorTests} from '@keyv/test-suite';
import Keyv from 'keyv';
import Redis from 'ioredis';
import KeyvRedis from '../src/index';

// eslint-disable-next-line @typescript-eslint/naming-convention
const REDIS_HOST = 'localhost';
// eslint-disable-next-line @typescript-eslint/naming-convention
const redisURI = `redis://${REDIS_HOST}`;

const store = () => new KeyvRedis(redisURI);

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);

test.it('reuse a redis instance', async t => {
	const redis = new Redis(redisURI);
	// @ts-expect-error foo doesn't exist on Redis
	redis.foo = 'bar';
	const keyv = new KeyvRedis(redis);
	t.expect(keyv.redis.foo).toBe('bar');

	await keyv.set('foo', 'bar');
	const value = await redis.get('foo');
	t.expect(value).toBe('bar');
	t.expect(await keyv.get('foo')).toBe(value);
});

test.it('set an undefined key', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);

	await keyv.set('foo2', undefined);
	const result = await keyv.get('foo2');
	t.expect(result).toBe(undefined);
});

test.it('Async Iterator 0 element test', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);
	await keyv.clear();
	const iterator = keyv.iterator('keyv');
	const key = await iterator.next();
	t.expect(key.value).toBe(undefined);
});

test.it('close connection successfully', async t => {
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis);
	t.expect(await keyv.get('foo')).toBe(undefined);
	await keyv.disconnect();
	try {
		await keyv.get('foo');
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it('should support tls', async t => {
	const options = {tls: {rejectUnauthorized: false}};
	const redis = new Redis('rediss://localhost:6380', options);
	const keyvRedis = new KeyvRedis(redis);
	await keyvRedis.set('foo', 'bar');
	t.expect(await keyvRedis.get('foo')).toBe('bar');
});

test.it('close tls connection successfully', async t => {
	const options = {tls: {rejectUnauthorized: false}};
	const redis = new Redis('rediss://localhost:6380', options);
	const keyvRedis = new KeyvRedis(redis);
	t.expect(await keyvRedis.get('foo5')).toBe(undefined);
	await keyvRedis.disconnect();
	try {
		await keyvRedis.get('foo5');
		t.expect.fail();
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it('clear method with empty keys should not error', async t => {
	try {
		const keyv = new KeyvRedis(redisURI);
		t.expect(await keyv.clear()).toBeUndefined();
	} catch {
		t.expect.fail();
	}
});

test.it('.clear() cleaned namespace', async t => {
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
	t.expect(await redis.exists('namespace:v3')).toBe(0);

	// Memory of each key should be null
	t.expect(await redis.memory('USAGE', 'namespace:v3')).toBe(null);
});

test.it('Keyv stores ttl without const', async t => {
	const keyv = new Keyv(redisURI);
	await keyv.set('foo', 'bar', 100);
	t.expect(await keyv.get('foo')).toBe('bar');
	tk.freeze(Date.now() + 150);
	t.expect(await keyv.get('foo')).toBe(undefined);
});

test.it('should handle KeyvOptions without uri', t => {
	const options = {
		isCluster: true,
	};
	const keyv = new KeyvRedis(options);
	t.expect(keyv.redis instanceof Redis).toBeTruthy();
});

test.it('should handle KeyvOptions with family option', t => {
	const options = {
		options: {},
		family: 'IPv4',
	};
	const keyv = new KeyvRedis(options);
	t.expect(keyv.redis instanceof Redis).toBeTruthy();
});

test.it('set method should use Redis sets when useRedisSets is false', async t => {
	const options = {useRedisSets: false};
	const keyv = new KeyvRedis(options);

	await keyv.set('foo', 'bar');

	const value = await keyv.get('foo');
	t.expect(value).toBe('bar');
});

test.it('clear method when useRedisSets is false', async t => {
	const options = {useRedisSets: false};
	const keyv = new KeyvRedis(options);

	await keyv.set('foo', 'bar');
	await keyv.set('foo2', 'bar2');

	await keyv.clear();

	const value = await keyv.get('demo');
	const value2 = await keyv.get('demo2');
	t.expect(value).toBe(undefined);
	t.expect(value2).toBe(undefined);
});

test.it('clear method when useRedisSets is false and empty keys should not error', async t => {
	const options = {useRedisSets: false};
	const keyv = new KeyvRedis(options);
	t.expect(await keyv.clear()).toBeUndefined();
});

test.it('when passing in ioredis set the options.useRedisSets', t => {
	const options = {useRedisSets: false};
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis, options);

	t.expect(keyv.opts.useRedisSets).toBe(false);
});

test.it('del should work when not using useRedisSets', async t => {
	const options = {useRedisSets: false};
	const redis = new Redis(redisURI);
	const keyv = new KeyvRedis(redis, options);

	await keyv.set('fooDel1', 'barDel1');

	await keyv.delete('fooDel1');

	const value = await keyv.get('fooDel1');

	t.expect(value).toBe(undefined);
});
