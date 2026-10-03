import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Miniflare spins up a local workerd runtime; give it room.
    testTimeout: 30000,
    include: ['test/*.ts'],
    coverage: {
      reporter: ['json', 'lcov', 'text'],
      reportOnFailure: true,
      exclude: ['src/types.ts', 'dist', 'vitest.config.ts'],
    },
  },
});
