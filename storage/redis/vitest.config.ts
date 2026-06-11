import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		// service-backed suites hit real containers; absorb one-off timing races
		retry: 2,
		fileParallelism: false,
		maxWorkers: 1,
		maxConcurrency: 1,
		include: ['test/*.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			reportOnFailure: true,
		},
	},
});
