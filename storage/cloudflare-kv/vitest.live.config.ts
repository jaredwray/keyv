import { defineConfig } from "vitest/config";

// Live integration tests hit the real Cloudflare KV REST API. They are kept out of the default
// `test/*.ts` run and only execute when CLOUDFLARE_* credentials are present (see test/live).
export default defineConfig({
	test: {
		include: ["test/live/**/*.ts"],
		testTimeout: 30000,
		retry: 2,
	},
});
