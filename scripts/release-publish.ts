/**
 * release-publish.ts — publishes the Keyv monorepo to npm with the correct
 * dist-tag for whichever major version is being released.
 *
 * ## Why this script exists
 *
 * Keyv supports more than one major version at a time (v6 in beta on `main`,
 * v5 stable on the `v5` branch). npm has a single special tag, `latest`, that
 * `npm install keyv` resolves to. If an older major were ever published to
 * `latest`, every default install would break — so the tag each release lands
 * on must be chosen deliberately rather than left to npm's default.
 *
 * ## The dist-tag model
 *
 *   Version being released        Resulting tag    Moves `latest`?
 *   ---------------------------    -------------    ---------------
 *   6.0.0-beta.1 (pre-release)     beta             no
 *   6.1.0-rc.2   (pre-release)     rc               no
 *   5.4.2  + LATEST_MAJOR=5        latest           YES
 *   5.4.2  + LATEST_MAJOR=6        v5-lts           no
 *   6.0.0  + LATEST_MAJOR=6        latest           YES
 *
 * `LATEST_MAJOR` is the single source of truth for "which major is the current
 * stable line". It lives as a GitHub Actions repository variable so every
 * branch agrees on it; flipping it from 5 to 6 is the entire v6 GA cutover.
 *
 * Users still install older lines with plain semver ranges — `keyv@5`, `keyv@4`
 * — which npm resolves to the newest stable of that major automatically. The
 * `v{major}-lts` tag is just the (mandatory) tag the publish runs under, and a
 * self-documenting alias. There is intentionally no `v5`/`v6` tag: npm rejects
 * dist-tag names that look like a semver range, so `keyv@6` is always the range
 * `6.x`, never a tag. See website/site/docs/versioning.md for the user-facing
 * explanation.
 *
 * ## Why everything is a single `publish --tag` (no `npm dist-tag add`)
 *
 * The release workflow authenticates to npm with OIDC trusted publishing (no
 * long-lived NPM_TOKEN). OIDC authorizes the `publish` command only — it does
 * NOT authorize `npm dist-tag add` (npm/cli#8547). So this script never calls
 * `dist-tag add`; it applies exactly one tag per package via `publish --tag`,
 * which keeps the pipeline token-free.
 *
 * ## Safety properties
 *
 * - Fail closed: registry lookups (`npm view`) treat only a real 404 as "not
 *   found"; any other failure (outage, network, auth) throws and aborts, so a
 *   transient error can never silently skip a check.
 * - Skip-unchanged: a package whose exact version already exists on the
 *   registry is skipped, so re-running on an unchanged branch is a no-op that
 *   exits 0 (pnpm would otherwise error on a duplicate publish).
 * - Per-package tag + downgrade guard: each package is tagged from its OWN
 *   version, and any package that would move its own `latest` is refused unless
 *   the new version is >= that package's current `latest`. This makes the one
 *   catastrophic mistake — `latest` moving onto an old major or backwards, for
 *   keyv or any adapter — mechanically impossible, even under version drift.
 * - Core-first publish: `keyv` publishes before the adapters that peer-depend on
 *   it; if core fails, the run aborts so dependents never ship without it.
 *
 * ## Inputs (environment variables)
 *
 * - LATEST_MAJOR        Major number that owns `latest` (e.g. "5"). Required
 *                       only for stable releases; pre-releases ignore it.
 * - DRY_RUN             "true" to print the plan and exit without publishing.
 *                       (The CLI flag `--dry-run` does the same locally.)
 * - GITHUB_STEP_SUMMARY If set (in CI), the plan table is appended to the job
 *                       summary as Markdown.
 *
 * ## Exit codes
 *
 * - 0  plan printed (dry run), nothing to publish, or all publishes succeeded.
 * - 1  stable release with no LATEST_MAJOR, downgrade guard tripped, or one or
 *      more package publishes failed.
 *
 * ## Where it runs
 *
 * Invoked by the `publish` job in .github/workflows/release.yaml as
 * `pnpm tsx scripts/release-publish.ts`. A `release: published` event publishes
 * for real; a manual `workflow_dispatch` defaults to a dry run.
 *
 * The pure helpers below (parseVersion / computeDistTag / isVersionGte) are
 * exported and unit-tested in release-publish.test.ts; `main()` only executes
 * when the file is run directly, so importing it for tests has no side effects.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// Monorepo root, resolved relative to this file (scripts/ lives one level down).
const rootDir = path.resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in release-publish.test.ts — no side effects).
// ---------------------------------------------------------------------------

export type ParsedVersion = {
	major: number;
	minor: number;
	patch: number;
	/** The pre-release portion after `-`, if any (e.g. "beta.1"); undefined for stable. */
	prerelease?: string;
};

/**
 * Parse a semver version into its parts. Deliberately dependency-free (the repo
 * doesn't ship `semver` at the root) and only as strict as this script needs:
 * it accepts an optional leading `v`, requires major.minor.patch, and captures
 * an optional `-prerelease` and `+build` suffix.
 *
 * @example parseVersion("6.0.0-beta.1") // { major: 6, minor: 0, patch: 0, prerelease: "beta.1" }
 * @example parseVersion("v5.4.2")       // { major: 5, minor: 4, patch: 2, prerelease: undefined }
 * @throws if the string isn't a recognizable major.minor.patch version.
 */
export function parseVersion(version: string): ParsedVersion {
	//          v?  major    minor    patch       -prerelease            +build
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
	if (!match) {
		throw new Error(`Unparseable version: "${version}"`);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4],
	};
}

export type DistTagPlan = {
	/** The single tag passed to `pnpm publish --tag`. */
	tag: string;
	/** Whether this release moves the `latest` tag (triggers the downgrade guard). */
	setsLatest: boolean;
	/** Human-readable explanation, surfaced in the printed plan. */
	reason: string;
};

/**
 * Decide which dist-tag a version publishes under. This is the heart of the
 * strategy — see the file header for the full table.
 *
 * - Pre-release (e.g. `6.0.0-beta.1`) -> the pre-release channel (`beta`). Never `latest`.
 * - Stable, major === latestMajor     -> `latest`.
 * - Stable, major !== latestMajor     -> `v{major}-lts` (old major, never `latest`).
 *
 * An old major is structurally barred from ever reaching `latest`: the only
 * path to the `latest` tag requires `major === latestMajor`. `latestMajor` is
 * only consulted for stable releases, so pre-releases can be published without
 * it being set.
 *
 * @param version     The version being released (from core/keyv/package.json).
 * @param latestMajor The major that currently owns `latest` (from LATEST_MAJOR).
 * @example computeDistTag("6.0.0-beta.1", 5) // { tag: "beta",   setsLatest: false }
 * @example computeDistTag("5.4.2", 5)        // { tag: "latest", setsLatest: true  }
 * @example computeDistTag("5.4.2", 6)        // { tag: "v5-lts", setsLatest: false }
 * @throws if a stable release is given without a valid `latestMajor`.
 */
export function computeDistTag(version: string, latestMajor: number | undefined): DistTagPlan {
	const parsed = parseVersion(version);

	// Pre-releases go to a floating channel named after the prerelease id
	// ("beta.1" -> "beta", "rc.2" -> "rc"). They must never touch `latest`.
	if (parsed.prerelease) {
		const channel = parsed.prerelease.split(".")[0].toLowerCase();
		return {
			tag: channel,
			setsLatest: false,
			reason: `pre-release (${version}) -> "${channel}" channel`,
		};
	}

	// From here on the release is stable, so we must know which major owns
	// `latest` to decide between `latest` and `v{major}-lts`.
	if (latestMajor === undefined || Number.isNaN(latestMajor)) {
		throw new Error(`LATEST_MAJOR must be set to a major number when publishing a stable release (${version}).`);
	}

	// The current stable line owns `latest`.
	if (parsed.major === latestMajor) {
		return {
			tag: "latest",
			setsLatest: true,
			reason: `stable v${parsed.major} === LATEST_MAJOR -> "latest"`,
		};
	}

	// An older (or, defensively, newer-but-not-yet-promoted) stable major gets
	// its own durable line tag and can never move `latest`.
	return {
		tag: `v${parsed.major}-lts`,
		setsLatest: false,
		reason: `stable v${parsed.major} !== LATEST_MAJOR (${latestMajor}) -> "v${parsed.major}-lts"`,
	};
}

/**
 * Returns true when version `a` is greater than or equal to version `b`,
 * comparing the major.minor.patch triple. Used by the downgrade guard so the
 * `latest` tag never moves backwards (e.g. a v5 patch can't clobber a v6
 * `latest`, and 5.4.1 can't replace 5.4.2). On an equal triple, a stable build
 * outranks the same triple carrying a pre-release tag; otherwise equal counts
 * as ">=" (the skip-unchanged check handles a true re-publish of the same
 * version separately).
 *
 * @example isVersionGte("5.4.3", "5.4.2") // true  — forward move, allowed
 * @example isVersionGte("5.9.9", "6.0.0") // false — would clobber a newer major
 */
export function isVersionGte(a: string, b: string): boolean {
	const pa = parseVersion(a);
	const pb = parseVersion(b);

	// Compare most-significant component first; the first difference decides.
	for (const key of ["major", "minor", "patch"] as const) {
		if (pa[key] !== pb[key]) {
			return pa[key] > pb[key];
		}
	}

	// Same triple: a (stable) is not >= b when b is the stable build and a is a
	// pre-release of it. In practice `latest` is always stable, so this branch
	// mainly documents intent.
	if (pa.prerelease && !pb.prerelease) {
		return false;
	}

	return true;
}

// ---------------------------------------------------------------------------
// IO helpers.
// ---------------------------------------------------------------------------

type WorkspacePackage = {
	name: string;
	version: string;
	dir: string;
};

/**
 * Resolve publishable workspace packages (non-private), using the same glob
 * source of truth as version-sync.ts. Private packages (root mono-repo, the
 * website) are skipped automatically.
 */
function getPublishablePackages(): WorkspacePackage[] {
	const workspaceConfig = yaml.load(fs.readFileSync(path.join(rootDir, "pnpm-workspace.yaml"), "utf-8")) as {
		packages?: string[];
	};
	const globs = workspaceConfig.packages ?? [];

	const dirs: string[] = [];
	for (const glob of globs) {
		if (glob.endsWith("/*")) {
			const parent = path.resolve(rootDir, glob.replace("/*", ""));
			if (fs.existsSync(parent)) {
				for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
					if (entry.isDirectory()) {
						dirs.push(path.join(parent, entry.name));
					}
				}
			}
		} else {
			const dir = path.resolve(rootDir, glob);
			if (fs.existsSync(dir)) {
				dirs.push(dir);
			}
		}
	}

	const packages: WorkspacePackage[] = [];
	for (const dir of dirs) {
		const pkgPath = path.join(dir, "package.json");
		if (!fs.existsSync(pkgPath)) {
			continue;
		}

		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
			name: string;
			version: string;
			private?: boolean;
		};

		if (pkg.private) {
			continue;
		}

		packages.push({ name: pkg.name, version: pkg.version, dir });
	}

	return packages;
}

/**
 * Run a read-only `npm view` query and return trimmed stdout.
 *
 * Returns `null` only when the package/version genuinely does not exist (npm
 * reports `E404`). Any other failure — registry outage, network/DNS error, auth
 * or policy error — is re-thrown so the release **fails closed** instead of
 * mistaking an outage for "not published" / "no latest tag" (the latter would
 * silently bypass the downgrade guard). stderr is captured (not inherited) so
 * the expected not-found case stays quiet.
 */
function npmView(args: string[]): string | null {
	try {
		return execFileSync("npm", ["view", ...args], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (error) {
		const stderr = (error as { stderr?: Buffer | string }).stderr?.toString() ?? "";
		if (stderr.includes("E404") || stderr.includes("404 Not Found")) {
			return null; // package or version not found — an expected, benign result
		}
		throw new Error(`npm view ${args.join(" ")} failed (treating as fatal): ${stderr.trim() || (error as Error).message}`);
	}
}

/**
 * True when the exact name@version already exists on the registry. A genuine
 * "not found" yields false; a registry/network failure throws (fail closed) so
 * we never mistakenly re-publish or skip on a transient error.
 */
function isPublished(name: string, version: string): boolean {
	const out = npmView([`${name}@${version}`, "version"]);
	return out !== null && out.length > 0;
}

/**
 * The version the `latest` dist-tag currently points at, or undefined when the
 * package has no `latest` yet (e.g. a brand-new package). A registry/network
 * failure throws (fail closed) so the downgrade guard is never silently skipped.
 */
function currentLatest(name: string): string | undefined {
	const out = npmView([name, "dist-tags.latest"]);
	return out && out.length > 0 ? out : undefined;
}

/**
 * Publish a single workspace package under exactly one dist-tag. Flags:
 * `--no-git-checks` (the release commit may be detached/tagged in CI),
 * `--access public` (required for the scoped `@keyv/*` packages), and verbose
 * logging to aid debugging during the rollout. Inherits stdio so npm's output
 * streams to the job log. Throws if the publish fails (caught by the caller).
 */
function publishPackage(name: string, tag: string): void {
	execFileSync(
		"pnpm",
		["--filter", name, "publish", "--tag", tag, "--no-git-checks", "--access", "public", "--loglevel=verbose"],
		{ stdio: "inherit" },
	);
}

function appendSummary(markdown: string): void {
	const file = process.env.GITHUB_STEP_SUMMARY;
	if (file) {
		fs.appendFileSync(file, `${markdown}\n`);
	}
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

/**
 * Orchestrates a release:
 *   1. Read inputs (DRY_RUN, LATEST_MAJOR) and the release version.
 *   2. Compute keyv's release dist-tag (for the headline/summary).
 *   3. Discover publishable packages and warn on version drift.
 *   4. Build the plan: tag each package from its OWN version, skipping versions
 *      already on the registry.
 *   5. Run the per-package downgrade guard for any package that moves `latest`.
 *   6. Stop here on a dry run; otherwise publish core `keyv` first, then the
 *      rest (aborting if core fails).
 */
function main(): void {
	// --- Step 1: inputs ---
	// DRY_RUN comes from the workflow input on manual runs; it's empty on real
	// `release` events, so those publish for real. `--dry-run` is the local
	// equivalent. LATEST_MAJOR is left undefined when unset/empty so that
	// computeDistTag can require it only for stable releases.
	const dryRun = process.env.DRY_RUN === "true" || process.argv.includes("--dry-run");
	const latestMajorRaw = process.env.LATEST_MAJOR;
	const latestMajor =
		latestMajorRaw === undefined || latestMajorRaw === "" ? undefined : Number(latestMajorRaw);

	// The release version is the synced keyv core version (all packages share it).
	const releaseVersion = (
		JSON.parse(fs.readFileSync(path.join(rootDir, "core", "keyv", "package.json"), "utf-8")) as {
			version: string;
		}
	).version;

	// --- Step 2: compute keyv's release dist-tag (throws on a stable release with
	// no LATEST_MAJOR). Each package is tagged from its OWN version in Step 4;
	// this is just keyv's tag, used for the headline/summary.
	const releasePlan = computeDistTag(releaseVersion, latestMajor);

	console.log(`\nRelease version: ${releaseVersion}`);
	console.log(`Dist-tag (keyv): ${releasePlan.tag}  (${releasePlan.reason})`);
	console.log(`Mode:            ${dryRun ? "DRY RUN — nothing will be published" : "PUBLISH"}\n`);

	// --- Step 3: discover packages ---
	const packages = getPublishablePackages();

	// Surface version drift. Each package is tagged and published from its own
	// version (below), so benign drift is handled; this is just for visibility.
	const drifted = packages.filter((p) => p.version !== releaseVersion);
	if (drifted.length > 0) {
		console.warn(`⚠️  ${drifted.length} package(s) differ from keyv@${releaseVersion}:`);
		for (const p of drifted) {
			console.warn(`     ${p.name}@${p.version}`);
		}
		console.warn("    (each is tagged from its own version; run `pnpm version:sync` to unify)\n");
	}

	// --- Step 4: build the plan ---
	// Compute the tag from EACH package's own version (not keyv's), so a drifted
	// package can never be published under the wrong channel — a stable adapter
	// during a beta core won't be tagged `beta`, and an old-major adapter during a
	// v6 GA won't be tagged `latest`. Then skip any version already on the registry
	// (the registry check fails closed on a non-404 error).
	type Row = { name: string; version: string; tag: string; setsLatest: boolean; action: "publish" | "skip" };
	const rows: Row[] = packages.map((p) => {
		let pkgPlan: DistTagPlan;
		try {
			pkgPlan = computeDistTag(p.version, latestMajor);
		} catch (error) {
			throw new Error(`Cannot determine dist-tag for ${p.name}@${p.version}: ${(error as Error).message}`);
		}
		return {
			name: p.name,
			version: p.version,
			tag: pkgPlan.tag,
			setsLatest: pkgPlan.setsLatest,
			action: isPublished(p.name, p.version) ? "skip" : "publish",
		};
	});

	const nameWidth = Math.max(7, ...rows.map((r) => r.name.length));
	console.log("Publish plan:");
	for (const r of rows) {
		const mark = r.action === "publish" ? "PUBLISH" : "skip (already published)";
		console.log(`  ${r.name.padEnd(nameWidth)}  ${r.version.padEnd(16)}  → ${r.tag.padEnd(8)}  [${mark}]`);
	}

	const toPublish = rows.filter((r) => r.action === "publish");
	console.log(`\n${toPublish.length} to publish, ${rows.length - toPublish.length} already published.\n`);

	// Mirror the plan into the GitHub Actions job summary (Markdown) when in CI.
	appendSummary(`### Release plan — keyv dist-tag \`${releasePlan.tag}\`${dryRun ? " (dry run)" : ""}`);
	appendSummary(`Version \`${releaseVersion}\` · ${releasePlan.reason}\n`);
	appendSummary("| Package | Version | Tag | Action |");
	appendSummary("| --- | --- | --- | --- |");
	for (const r of rows) {
		appendSummary(`| ${r.name} | ${r.version} | ${r.tag} | ${r.action} |`);
	}

	// --- Step 5: downgrade guard (per package) ---
	// For every package that would move its own `latest`, refuse if the version
	// being published isn't >= that package's current `latest`. Checking each
	// package — not just keyv — means a drifted adapter whose `latest` is already
	// ahead can't be silently moved backwards. currentLatest() fails closed, so a
	// registry error aborts here rather than skipping the guard.
	const violations: string[] = [];
	for (const r of toPublish.filter((row) => row.setsLatest)) {
		const existing = currentLatest(r.name);
		if (existing && !isVersionGte(r.version, existing)) {
			violations.push(`${r.name}: ${r.version} is older than current latest ${existing}`);
		} else {
			console.log(`latest guard ok: ${r.name}@${r.version} >= current latest (${existing ?? "none"}).`);
		}
	}
	if (violations.length > 0) {
		console.error('\n✖ Refusing to publish — these would move "latest" backwards:');
		for (const v of violations) {
			console.error(`     ${v}`);
		}
		process.exit(1);
	}

	// --- Step 6: publish (or stop) ---
	if (dryRun) {
		console.log("\nDry run complete — nothing published.");
		return;
	}

	if (toPublish.length === 0) {
		console.log("Nothing to publish — all versions already on the registry.");
		return;
	}

	// Publish core `keyv` first: every @keyv/* adapter declares keyv as a peer
	// dependency, so dependents must never reach the registry without the matching
	// core. If the core publish fails, abort immediately — do not publish the rest.
	const ordered = [...toPublish].sort((a, b) => (a.name === "keyv" ? -1 : b.name === "keyv" ? 1 : 0));

	const failures: string[] = [];
	for (const r of ordered) {
		console.log(`\nPublishing ${r.name}@${r.version} → ${r.tag} ...`);
		try {
			publishPackage(r.name, r.tag);
		} catch (error) {
			console.error(`✖ Failed to publish ${r.name}@${r.version}: ${(error as Error).message}`);
			if (r.name === "keyv") {
				console.error("✖ Aborting: core `keyv` failed to publish, so its dependents will not be published.");
				process.exit(1);
			}
			failures.push(`${r.name}@${r.version}`);
		}
	}

	if (failures.length > 0) {
		console.error(`\n✖ ${failures.length} package(s) failed to publish: ${failures.join(", ")}`);
		process.exit(1);
	}

	console.log(`\n✓ Published ${toPublish.length} package(s).`);
}

// Only run when executed directly (e.g. `pnpm tsx scripts/release-publish.ts`),
// not when imported by the test for the pure helpers above.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
