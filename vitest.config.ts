import { defineConfig } from "vitest/config";

// Root-level config scoped to the monorepo's release/maintenance scripts.
// Per-package tests use each package's own vitest.config.ts via `pnpm -r test`;
// this exists so `pnpm test:scripts` can verify the scripts in `scripts/`.
export default defineConfig({
	test: {
		include: ["scripts/**/*.test.ts"],
	},
});
