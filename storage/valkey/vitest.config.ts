import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		// service-backed suites hit real containers; absorb one-off timing races
		retry: 2,
		// suites share a single Valkey instance; run sequentially to avoid cross-file interference
		fileParallelism: false,
		maxWorkers: 1,
		maxConcurrency: 1,
		include: ['test/*.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			reportOnFailure: true,
			exclude: [
				'src/types.ts',
				'vitest.config.ts',
				'dist',
			],
		},
	},
});
