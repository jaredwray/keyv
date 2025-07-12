import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
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
