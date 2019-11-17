import test from 'ava';
import keyvTestSuite, { keyvOfficialTests } from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvRedis from 'this';
import Redis from 'ioredis';

const { REDIS_HOST = 'localhost' } = process.env;
const redisURI = `redis://${REDIS_HOST}`;

keyvOfficialTests(test, Keyv, redisURI, 'redis://foo');

const store = () => new KeyvRedis(redisURI);
keyvTestSuite(test, Keyv, store);

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
