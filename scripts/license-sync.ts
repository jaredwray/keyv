import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

const rootDir = path.resolve(import.meta.dirname, "..");

// Read the root LICENSE — the source of truth synced to every package
const rootLicensePath = path.join(rootDir, "LICENSE");
const license = fs.readFileSync(rootLicensePath, "utf-8");

console.log("Syncing LICENSE from root to all packages");

// Parse pnpm-workspace.yaml to get workspace globs
const workspaceYamlPath = path.join(rootDir, "pnpm-workspace.yaml");
const workspaceConfig = yaml.load(fs.readFileSync(workspaceYamlPath, "utf-8")) as { packages?: string[] };
const globs: string[] = workspaceConfig.packages ?? [];

// Ensure a resolved path is within the project root to prevent path traversal
function safePath(unsafePath: string): string | undefined {
	const resolved = path.resolve(rootDir, unsafePath);
	if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
		console.warn(`  Skipping path outside project root: ${unsafePath}`);
		return undefined;
	}

	return resolved;
}

// Resolve globs to actual package directories
const packageDirs: string[] = [];
for (const glob of globs) {
	if (glob.endsWith("/*")) {
		// Wildcard glob — enumerate subdirectories
		const parentDir = safePath(glob.replace("/*", ""));
		if (parentDir && fs.existsSync(parentDir)) {
			for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					const dir = path.join(parentDir, entry.name);
					if (safePath(path.relative(rootDir, dir))) {
						packageDirs.push(dir);
					}
				}
			}
		}
	} else {
		// Exact path
		const dir = safePath(glob);
		if (dir && fs.existsSync(dir)) {
			packageDirs.push(dir);
		}
	}
}

// Copy the LICENSE into each package
let updated = 0;
let skipped = 0;
for (const dir of packageDirs) {
	// Only sync to actual packages
	if (!fs.existsSync(path.join(dir, "package.json"))) {
		continue;
	}

	const licensePath = path.join(dir, "LICENSE");
	if (fs.existsSync(licensePath) && fs.readFileSync(licensePath, "utf-8") === license) {
		skipped++;
		continue;
	}

	fs.writeFileSync(licensePath, license);
	console.log(`  ${path.relative(rootDir, dir)}`);
	updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
