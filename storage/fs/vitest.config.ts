import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			reportOnFailure: true,
			exclude: [
				'benchmark',
				'dist',
				'src/types.ts',
				'test',
				'vitest.config.ts',
			],
		},
	},
});
