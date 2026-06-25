import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Miniflare spins up a local workerd runtime; give it room and absorb timing races.
    retry: 2,
    testTimeout: 30000,
    include: ['test/*.ts'],
    coverage: {
      reporter: ['json', 'lcov', 'text'],
      reportOnFailure: true,
      exclude: ['src/types.ts', 'dist', 'vitest.config.ts'],
    },
  },
});
