import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");

// Read the root package.json version
const rootPackagePath = path.join(rootDir, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf-8")) as { version: string };
const { version } = rootPackage;

console.log(`Syncing version: ${version}`);

// Parse pnpm-workspace.yaml to get workspace globs
const workspaceYamlPath = path.join(rootDir, "pnpm-workspace.yaml");
const workspaceYaml = fs.readFileSync(workspaceYamlPath, "utf-8");
const globs: string[] = [];
for (const line of workspaceYaml.split("\n")) {
	const match = line.match(/^\s+-\s+'(.+)'$/);
	if (match) {
		globs.push(match[1]);
	}
}

// Resolve globs to actual package directories
const packageDirs: string[] = [];
for (const glob of globs) {
	if (glob.endsWith("/*")) {
		// Wildcard glob — enumerate subdirectories
		const parentDir = path.join(rootDir, glob.replace("/*", ""));
		if (fs.existsSync(parentDir)) {
			for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					packageDirs.push(path.join(parentDir, entry.name));
				}
			}
		}
	} else {
		// Exact path
		const dir = path.join(rootDir, glob);
		if (fs.existsSync(dir)) {
			packageDirs.push(dir);
		}
	}
}

// Update each package.json
let updated = 0;
for (const dir of packageDirs) {
	const pkgPath = path.join(dir, "package.json");
	if (!fs.existsSync(pkgPath)) {
		continue;
	}

	const raw = fs.readFileSync(pkgPath, "utf-8");
	const pkg = JSON.parse(raw) as { name: string; version: string };
	const oldVersion = pkg.version;
	pkg.version = version;

	// Preserve original formatting (detect indent)
	const indent = raw.match(/^(\s+)"/m)?.[1] ?? "\t";
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + "\n");

	console.log(`  ${pkg.name}: ${oldVersion} → ${version}`);
	updated++;
}

console.log(`\nUpdated ${updated} package(s) to version ${version}`);
