import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "node:fs";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	platform: "node",
	target: "node18",
	async onSuccess() {
		// Fix the buffer import for Deno compatibility
		const files = ["dist/index.js", "dist/index.cjs"];
		for (const file of files) {
			try {
				let content = readFileSync(file, "utf8");
				content = content.replace(
					/from ["']buffer["']/g,
					'from "node:buffer"',
				);
				content = content.replace(
					/require\(["']buffer["']\)/g,
					'require("node:buffer")',
				);
				writeFileSync(file, content);
			} catch {
				// File might not exist
			}
		}
	},
});
