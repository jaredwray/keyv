import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/*.ts'],
		coverage: {
			reporter: ['json', 'lcov', 'text'],
			exclude: ['src/types.ts', 'vitest.config.ts', 'dist/**'],
			reportOnFailure: true,
		},
	},
});
