import { defineConfig } from "vitest/config";

// Only the website's own tests. site/public holds a static v5 snapshot that must not be collected.
export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		coverage: {
			reporter: ["json", "lcov", "text"],
			reportOnFailure: true,
			include: ["src/**/*.ts"],
			// docs.ts is the build script that `pnpm website:build` runs; it runs on import.
			exclude: ["src/docs.ts"],
		},
	},
});
