import {describe, test, expect} from 'vitest';
import KeyvRedis, {createCluster} from '../src/index.js';

const defaultClusterOptions = {
	rootNodes: [
		{
			url: 'redis://localhost:7001',
		},
		{
			url: 'redis://localhost:7002',
		},
		{
			url: 'redis://localhost:7003',
		},
	],
	useReplicas: true,
};

describe('KeyvRedis Cluster', () => {
	test('should be able to connect to a cluster', async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		expect(keyvRedis).toBeDefined();
		expect(keyvRedis.client).toEqual(cluster);
	});

	test('should be able to send in cluster options', async () => {
		const keyvRedis = new KeyvRedis(defaultClusterOptions);
		expect(keyvRedis.isCluster()).toBe(true);
	});

	test('should be able to set the redis cluster client', async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis();
		expect(keyvRedis.isCluster()).toBe(false);

		keyvRedis.client = cluster;
		expect(keyvRedis.client).toEqual(cluster);
		expect(keyvRedis.isCluster()).toBe(true);
	});

	test('should be able to set a value', async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		await keyvRedis.delete('test-cl1');

		const undefinedResult = await keyvRedis.get('test-cl1');
		expect(undefinedResult).toBeUndefined();

		await keyvRedis.set('test-cl1', 'test');

		const result = await keyvRedis.get('test-cl1');

		expect(result).toBe('test');

		await keyvRedis.delete('test-cl1');
	});

	test('should throw an error on clear', async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		let errorThrown = false;
		try {
			await keyvRedis.clear();
		} catch (error) {
			expect(error).toBeDefined();
			errorThrown = true;
		}

		expect(errorThrown).toBe(true);
	});

	test('should throw an error on iterator', async () => {
		const cluster = createCluster(defaultClusterOptions);

		const keyvRedis = new KeyvRedis(cluster);

		let errorThrown = false;
		try {
			const keys = [];
			const values = [];
			for await (const [key, value] of keyvRedis.iterator('foo')) {
				keys.push(key);
				values.push(value);
			}
		} catch (error) {
			expect(error).toBeDefined();
			errorThrown = true;
		}

		expect(errorThrown).toBe(true);
	});
});
