import * as test from 'vitest';
import Keyv, {type KeyvStoreAdapter} from 'keyv';
import KeyvRedis from '@keyv/redis';
import keyvTestSuite from '@keyv/test-suite';
import KeyvOffline from '../src/index';

const keyvRedisBad = new KeyvRedis({
	uri: 'redis://user:pass@localhost:1338',
	// @ts-expect-error - maxRetriesPerRequest doesn't exist on RedisOptions
	maxRetriesPerRequest: 0,
	emitErrors: false,
});

keyvRedisBad.on('error', () => {
	console.log('Connection error');
});

test.it('.set return true under normal behavior', async t => {
	const store = new Map() as unknown as KeyvStoreAdapter;
	const keyv = new KeyvOffline(new Keyv({store}));
	const result = await keyv.set('foo', 'expires in 1 second', 1000) as boolean;
	t.expect(result).toBeTruthy();
});

test.it('.get return the expected value under normal behavior', async t => {
	const store = new Map() as unknown as KeyvStoreAdapter;
	const keyv = new KeyvOffline(new Keyv({store}));
	await keyv.set('foo', 'bar');
	t.expect(await keyv.get('foo')).toBe('bar');
});

test.it('.set return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	const result = await keyv.set('foo', 'expires in 1 second', 1000) as boolean;
	console.log('');
	t.expect(result).toBeFalsy();
});

test.it('.set return undefined if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	const result = await keyv.get('foo');
	t.expect(result).toBeUndefined();
});

test.it('.clear return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);

	const clearStatus = await keyv.clear();
	t.expect(clearStatus).toBeFalsy();
	t.expect(typeof keyv.clear).toBe('function');
});

test.it('.delete return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	// @ts-expect-error - test for false return value
	t.expect(await keyv.delete()).toBeFalsy();
	t.expect(typeof keyv.delete).toBe('function');
});

test.it('.getMany return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	// @ts-expect-error - test for false return value
	t.expect(await keyv.getMany()).toBeFalsy();
	t.expect(typeof keyv.getMany).toBe('function');
});

test.it('.has return false if store is unreachable', async t => {
	const keyv = new KeyvOffline(keyvRedisBad);
	// @ts-expect-error - test for false return value
	t.expect(await keyv.has()).toBeFalsy();
	t.expect(typeof keyv.has).toBe('function');
});

const REDIS_HOST = 'localhost';
const redisURI = `redis://${REDIS_HOST}`;

const store = () => new KeyvOffline(new KeyvRedis(redisURI));

keyvTestSuite(test, Keyv, store);
