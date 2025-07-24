import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		maxWorkers: 1,
		fileParallelism: false,
		include: ['test/*.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			reportOnFailure: true,
		},
	},
});
