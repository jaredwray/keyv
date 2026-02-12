import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
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
