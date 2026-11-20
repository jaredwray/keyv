import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["combined.ts", "readme.ts", "workload.ts"],
	format: "esm",
	dts: false,
	deps: { alwaysBundle: [/./], onlyImport: ["@node-rs/xxhash", "@opentelemetry/api"] },
});
