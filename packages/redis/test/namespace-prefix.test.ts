import {
	afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import {createClient} from '@redis/client';
import KeyvRedis, {createKeyv} from '../src/index.js';

describe('Redis namespace prefix', () => {
	const redis = createClient();
	const key = 'admin';
	const value = 'test123';
	const namespace = 'users';

	beforeAll(async () => {
		await redis.connect();
		await redis.flushDb();
	});

	afterAll(async () => {
		await redis.quit();
	});

	it('should prefix key only once with namespace', async () => {
        const keyv = createKeyv('redis://localhost:6379', { namespace });
    
        await keyv.set(key, value);
        const keys = await redis.keys('*');
        console.log('🧪 Redis keys:', keys);
    
        expect(keys).toContain(`${namespace}::${key}`);
        expect(keys).not.toContain(`${namespace}::${namespace}::${key}`);
    });
});
