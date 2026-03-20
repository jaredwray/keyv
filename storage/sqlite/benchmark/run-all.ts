import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const scripts = [
	{ name: "better-sqlite3", file: "better-sqlite3.ts" },
	{ name: "node:sqlite", file: "node-sqlite.ts" },
];

for (const script of scripts) {
	console.log(`--- ${script.name} ---`);
	try {
		const output = execSync(`tsx ${resolve(__dirname, script.file)}`, {
			encoding: "utf8",
			cwd: resolve(__dirname, ".."),
		});
		console.log(output);
	} catch {
		console.log(`  Skipped: ${script.name} driver not available\n`);
	}
}
