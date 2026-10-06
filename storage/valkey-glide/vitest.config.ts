import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		// suites share database 1 of the Valkey server (the @keyv/valkey tests use database 0);
		// run sequentially to avoid cross-file interference
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
