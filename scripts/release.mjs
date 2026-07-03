#!/usr/bin/env node
/**
 * Release orchestrator for the Keyv v5 maintenance branch.
 *
 * Versions are set **manually** (each package's `version` in package.json is
 * bumped by a human / release PR). This script never changes versions. Its job
 * is to decide, for every publishable workspace package, whether the locally
 * declared version still needs to be published — and under which dist-tag —
 * and, unless running a dry run, to publish the ones that do.
 *
 * ## The v5 branch context
 *
 * Keyv v6 is developed and released from `main` (all of its packages are on
 * the 6.x line). This branch is the v5 maintenance line, so two invariants are
 * enforced mechanically:
 *
 *   1. THE MAJOR CEILING — no package on this branch may ever publish a
 *      version whose major is above MAX_MAJOR (5). 6.0.0, 6.0.0-beta.1 and
 *      anything higher belong to `main`; the run aborts before any registry
 *      call if a manifest crosses the ceiling.
 *   2. `latest` (and every other dist-tag) never moves backwards. Once v6 GA
 *      owns `latest`, v5 releases automatically publish under `v5-lts`
 *      instead — same convention as main's release-publish.ts — with no
 *      workflow variable to flip on this branch.
 *
 * ## How "needs publishing" is decided
 *
 *   1. Enumerate workspace packages with `pnpm -r ls --depth -1 --json`.
 *   2. Drop packages that are `private` or explicitly ignored (see
 *      IGNORED_PACKAGES) — these are never published to npm.
 *   3. Refuse the whole run if any package version crosses the major ceiling.
 *   4. For each remaining package, fetch its document from the npm registry:
 *        - 404            → the package has never been published   → publish
 *        - version listed → this exact version is already on npm    → skip
 *        - version absent → a newer (manually-set) version is ready → publish
 *   5. The full plan — including each package's dist-tag — is computed before
 *      anything is published. If the registry state of any package cannot be
 *      determined (after retries), the run aborts *before* publishing
 *      anything: a release is all-or-nothing on a known plan, never a
 *      partial guess.
 *   6. Immediately before each real publish the package is re-verified
 *      against the live registry under the same rules, so a concurrent
 *      release from another branch (e.g. v6 going GA from main mid-run)
 *      cannot race the snapshot the plan was computed from.
 *
 * ## The dist-tag model (per package, from the registry's own state)
 *
 *   Local version   Registry `latest`   Resulting tag   Moves `latest`?
 *   -------------   -----------------   -------------   ---------------
 *   5.6.1           5.6.0               latest          YES (forward)
 *   5.6.1           6.0.0 (v6 GA'd)     v5-lts          no
 *   1.1.2           1.1.1               latest          YES (forward)
 *   1.1.2           6.0.0 (synced v6)   v1-lts          no
 *   5.5.0           5.6.0               — refused —     (would roll back)
 *   5.7.0-beta.1    any                 beta            no
 *   5.7.0-beta.1    (beta tag owned     v5-beta         no
 *                    by 6.0.0-beta.x)
 *
 * Every package is tagged from its OWN version against its OWN registry
 * document, so the heterogeneous majors on this branch (keyv 5.x, serialize
 * 1.x, sqlite 4.x, …) each get the right tag without any shared setting.
 * Whatever tag is computed, the publish is refused if it would move that
 * dist-tag backwards on the registry.
 *
 * ## Publish order and authentication
 *
 * Publishing happens in **dependency order** (topological sort over the
 * workspace's runtime deps — dependencies, optionalDependencies and
 * peerDependencies): a package is always published after the workspace
 * packages it relies on, because pnpm rewrites each `workspace:^` reference
 * to the dependency's concrete version at publish time, and a dependent must
 * never be released ahead of a dependency it points at. If a run fails
 * partway, dependencies are already published before their dependents.
 *
 * Publishing uses pnpm only (never npm) with provenance, so packages are
 * cryptographically linked to this repo + workflow when run from CI with an
 * OIDC `id-token: write` permission (npm trusted publishing — no NPM_TOKEN):
 *
 *     pnpm --filter <name> publish --tag <tag> --provenance --access public --no-git-checks
 *
 * ## Usage
 *
 *   node scripts/release.mjs              # publish every package whose version is new
 *   node scripts/release.mjs --dry-run    # print the plan + validate packaging, publish nothing
 *   node scripts/release.mjs --json       # emit the plan as JSON (implies no publishing noise)
 *
 * ## Environment
 *
 *   NPM_CONFIG_REGISTRY   override the registry queried + published to (default: npmjs.org)
 *   GITHUB_STEP_SUMMARY   when set, a markdown summary table is appended to it
 *   GITHUB_OUTPUT         when set, `published-count` / `published-packages` outputs are written
 *
 * Exit codes: 0 = success (including "nothing to publish"); non-zero = the
 * major ceiling was crossed, a dist-tag would move backwards, a registry
 * lookup failed, or a publish failed.
 *
 * The pure helpers (parseVersion / compareSemver / computeTag /
 * resolvePlanAction) are exported and unit-tested in release.test.mjs;
 * main() only executes when the file is run directly, so importing it for
 * tests has no side effects.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REGISTRY = (process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org").replace(/\/$/, "");

/**
 * THE MAJOR CEILING for this branch. Keyv v6 is the line released from
 * `main`, so nothing on the v5 branch may ever publish a version at or above
 * 6.0.0 — including 6.0.0 pre-releases, which is why the check is on the
 * major number rather than full semver precedence (6.0.0-beta.1 sorts below
 * 6.0.0 but still belongs to main's line).
 */
export const MAX_MAJOR = 5;

/**
 * Packages that live in the workspace and are *not* marked `private`, yet
 * should never be published to npm. Keep this list small and documented —
 * removing a name here is all it takes to start publishing that package.
 * (The private @keyv/website package is excluded automatically.)
 */
const IGNORED_PACKAGES = new Set([]);

function parseArgs(argv) {
	const args = { dryRun: false, json: false, help: false };
	for (const arg of argv) {
		switch (arg) {
			case "--dry-run":
			case "-d":
				args.dryRun = true;
				break;
			case "--json":
				args.json = true;
				break;
			case "--help":
			case "-h":
				args.help = true;
				break;
			default:
				console.error(`Unknown argument: ${arg}`);
				process.exit(2);
		}
	}

	return args;
}

const HELP = `Release orchestrator for the Keyv v5 maintenance branch.

Usage:
  node scripts/release.mjs            Publish every package whose version is not yet on npm
  node scripts/release.mjs --dry-run  Print the plan and validate packaging without publishing
  node scripts/release.mjs --json     Emit the publish plan as JSON

Versions are set manually; this script never bumps them. No version may be
6.0.0 or higher — v6 is released from the main branch.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in release.test.mjs — no side effects).
// ---------------------------------------------------------------------------

/**
 * Parse a semver version into its parts. Deliberately dependency-free (the
 * repo doesn't ship `semver` at the root) and only as strict as this script
 * needs: it accepts an optional leading `v`, requires major.minor.patch, and
 * captures an optional `-prerelease` suffix (`+build` metadata is dropped).
 *
 * @example parseVersion("6.0.0-beta.1") // { major: 6, minor: 0, patch: 0, prerelease: "beta.1" }
 * @throws if the string isn't a recognizable major.minor.patch version.
 */
export function parseVersion(version) {
	//          v?  major    minor    patch       -prerelease            +build
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(version).trim());
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

/** True when a version crosses the branch's major ceiling (see MAX_MAJOR). */
export function exceedsMajorCeiling(version) {
	return parseVersion(version).major > MAX_MAJOR;
}

/** Compare two semver versions by precedence. Returns -1, 0, or 1; build metadata is ignored. */
export function compareSemver(a, b) {
	const pa = parseVersion(a);
	const pb = parseVersion(b);

	for (const key of ["major", "minor", "patch"]) {
		if (pa[key] !== pb[key]) {
			return pa[key] < pb[key] ? -1 : 1;
		}
	}

	// Equal cores: a prerelease has LOWER precedence than the matching release.
	const ra = pa.prerelease ?? "";
	const rb = pb.prerelease ?? "";
	if (ra === "" || rb === "") {
		if (ra === rb) return 0;
		return ra === "" ? 1 : -1;
	}

	const ida = ra.split(".");
	const idb = rb.split(".");
	for (let i = 0; i < Math.max(ida.length, idb.length); i++) {
		const x = ida[i];
		const y = idb[i];
		if (x === undefined) return -1; // fewer identifiers → lower precedence
		if (y === undefined) return 1;
		const xNum = /^\d+$/.test(x);
		const yNum = /^\d+$/.test(y);
		if (xNum && yNum) {
			const diff = Number.parseInt(x, 10) - Number.parseInt(y, 10);
			if (diff !== 0) return diff < 0 ? -1 : 1;
		} else if (xNum !== yNum) {
			return xNum ? -1 : 1; // numeric identifiers rank below alphanumeric
		} else if (x !== y) {
			return x < y ? -1 : 1;
		}
	}

	return 0;
}

/**
 * Decide which dist-tag a version publishes under, from that package's own
 * registry dist-tags. Returns `{ tag, reason }` on success or
 * `{ error: reason }` when no safe tag exists. See the file header for the
 * full decision table.
 *
 * - Pre-release → the channel named by its first identifier ("beta.1" →
 *   "beta"). If that channel is currently owned by a NEWER major (e.g. main
 *   publishing 6.0.0-beta.x to `beta`), fall back to the major-scoped
 *   channel `v{major}-{channel}` so the shared channel never moves backwards.
 * - Stable, ahead of (or without) `latest` → `latest`.
 * - Stable, behind a newer-major `latest`   → `v{major}-lts` (maintenance).
 * - Stable, behind `latest` within the same major → refused (a rollback).
 *
 * The caller additionally applies a universal backwards guard on whatever tag
 * comes out of here (see resolvePlanAction).
 *
 * @param version  The package's local version.
 * @param distTags The package's `dist-tags` object from the registry ({} for
 *                 a brand-new package).
 */
export function computeTag(version, distTags = {}) {
	const parsed = parseVersion(version);

	if (parsed.prerelease) {
		let channel = parsed.prerelease.split(".")[0].toLowerCase();
		// npm rejects dist-tags that parse as semver ranges, so a purely
		// numeric prerelease ("5.7.0-0") has no publishable channel name.
		if (!/^[a-z][a-z0-9-]*$/.test(channel)) {
			return {
				error: `pre-release "${version}" has no usable channel name — use a named identifier like -beta.1 or -rc.1`,
			};
		}

		// Channel names that would collide with the tags this script manages
		// ("latest", the v{major}-lts convention) or that npm rejects as
		// semver-range-like ("x", "v5", …) have no safe channel. Refuse at
		// plan time — a hand-authored "5.7.0-latest.1" must never end up
		// publishing a pre-release under the `latest` dist-tag.
		if (channel === "latest" || channel === "lts" || channel === "x" || /^v\d/.test(channel)) {
			return {
				error: `pre-release "${version}" would publish under the reserved channel "${channel}" — use a named identifier like -beta.1 or -rc.1`,
			};
		}

		const current = distTags[channel];
		if (current && parseVersion(current).major > parsed.major) {
			// The plain channel belongs to a newer line (published from main);
			// use the major-scoped channel instead of moving it backwards.
			channel = `v${parsed.major}-${channel}`;
		}

		return { tag: channel, reason: `pre-release → "${channel}" channel` };
	}

	const latest = distTags.latest;
	if (!latest || compareSemver(version, latest) >= 0) {
		return {
			tag: "latest",
			reason: latest ? `moves latest forward from ${latest}` : "no latest on the registry yet",
		};
	}

	const latestMajor = parseVersion(latest).major;
	if (parsed.major < latestMajor) {
		return {
			tag: `v${parsed.major}-lts`,
			reason: `v${parsed.major} maintenance release behind registry latest ${latest}`,
		};
	}

	return {
		error: `version ${version} is behind registry latest ${latest} within the same major — refusing to move latest backwards`,
	};
}

/**
 * Resolve what to do with a single package given its (already fetched)
 * registry document — the pure core of resolvePlanEntry. `doc` is null when
 * the package has never been published.
 *
 * Returns the package extended with `{ registryVersion, tag, action, reason }`
 * where action is "publish" | "skip" | "error".
 */
export function resolvePlanAction(pkg, doc) {
	if (doc === null) {
		const plan = computeTag(pkg.version, {});
		if (plan.error) {
			return { ...pkg, registryVersion: null, tag: null, action: "error", reason: plan.error };
		}

		return { ...pkg, registryVersion: null, tag: plan.tag, action: "publish", reason: "not yet on npm" };
	}

	const distTags = doc["dist-tags"] ?? {};
	const latest = distTags.latest ?? null;

	if (Object.hasOwn(doc.versions ?? {}, pkg.version)) {
		return { ...pkg, registryVersion: latest, tag: null, action: "skip", reason: "already published" };
	}

	const plan = computeTag(pkg.version, distTags);
	if (plan.error) {
		return { ...pkg, registryVersion: latest, tag: null, action: "error", reason: plan.error };
	}

	// Universal backwards guard: whatever tag was computed, refuse to move an
	// existing dist-tag to a lower version. This is what makes the one
	// catastrophic mistake — `latest` (or `v5-lts`, or a beta channel) moving
	// backwards on the registry — mechanically impossible.
	const current = distTags[plan.tag];
	if (current && compareSemver(pkg.version, current) < 0) {
		return {
			...pkg,
			registryVersion: latest,
			tag: plan.tag,
			action: "error",
			reason: `would move dist-tag "${plan.tag}" backwards (${current} → ${pkg.version})`,
		};
	}

	return {
		...pkg,
		registryVersion: latest,
		tag: plan.tag,
		action: "publish",
		reason: `new version (${plan.reason})`,
	};
}

// ---------------------------------------------------------------------------
// Workspace + registry IO.
// ---------------------------------------------------------------------------

/** Enumerate publishable workspace packages via pnpm (respects pnpm-workspace.yaml). */
function listWorkspacePackages() {
	const result = spawnSync("pnpm", ["-r", "ls", "--depth", "-1", "--json"], {
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});

	if (result.status !== 0) {
		throw new Error(`\`pnpm -r ls\` failed: ${result.stderr || result.stdout || result.error?.message}`);
	}

	/** @type {Array<{name:string,version:string,path:string,private?:boolean}>} */
	const entries = JSON.parse(result.stdout);

	return entries
		.filter((pkg) => pkg.name && pkg.version)
		.filter((pkg) => pkg.private !== true)
		.filter((pkg) => !IGNORED_PACKAGES.has(pkg.name))
		.map((pkg) => ({ name: pkg.name, version: pkg.version, path: pkg.path }));
}

/** Read the workspace packages a given package depends on at runtime. */
function readInternalDeps(pkg, workspaceNames) {
	const manifest = JSON.parse(readFileSync(path.join(pkg.path, "package.json"), "utf8"));
	// Only runtime-facing deps are rewritten into the published manifest and
	// thus constrain publish order — devDependencies are not installed by
	// consumers, so a dev-only `workspace:` link never affects ordering.
	const deps = {
		...manifest.dependencies,
		...manifest.optionalDependencies,
		...manifest.peerDependencies,
	};
	return Object.keys(deps).filter((dep) => workspaceNames.has(dep));
}

/**
 * Order packages so every package comes after the workspace dependencies it
 * relies on (Kahn's algorithm; alphabetical within a tier for determinism).
 * For this workspace that means @keyv/serialize → keyv → the adapters that
 * peer-depend on keyv. Throws on a dependency cycle.
 */
function orderByDependencies(packages) {
	const workspaceNames = new Set(packages.map((pkg) => pkg.name));
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const deps = new Map(packages.map((pkg) => [pkg.name, new Set(readInternalDeps(pkg, workspaceNames))]));

	const ordered = [];
	const emitted = new Set();
	let remaining = packages.map((pkg) => pkg.name).sort();

	while (remaining.length > 0) {
		const ready = remaining.filter((name) => [...deps.get(name)].every((dep) => emitted.has(dep)));
		if (ready.length === 0) {
			throw new Error(`dependency cycle among workspace packages: ${remaining.join(", ")}`);
		}

		for (const name of ready) {
			ordered.push(byName.get(name));
			emitted.add(name);
		}

		remaining = remaining.filter((name) => !emitted.has(name));
	}

	return ordered;
}

/** Fetch a package's document from the registry, with retry + backoff. 404 → null. */
async function fetchRegistryDoc(name, { retries = 4 } = {}) {
	const url = `${REGISTRY}/${name.replaceAll("/", "%2F")}`;
	let lastError;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { accept: "application/json" },
				// Fail fast instead of hanging on a stalled registry; a timeout is
				// caught below and retried with backoff like any other error.
				signal: AbortSignal.timeout(10_000),
			});
			if (res.status === 404) {
				return null;
			}

			if (!res.ok) {
				throw new Error(`registry responded ${res.status}`);
			}

			return await res.json();
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await sleep(2 ** attempt * 1000); // 1s, 2s, 4s, 8s
			}
		}
	}

	throw new Error(`failed to query the registry for ${name}: ${lastError?.message ?? lastError}`);
}

/** Resolve whether (and under which tag) a single package needs publishing. */
async function resolvePlanEntry(pkg) {
	const doc = await fetchRegistryDoc(pkg.name);
	return resolvePlanAction(pkg, doc);
}

/** Build the full plan up front; throws if any package's state can't be determined. */
async function buildPlan(packages) {
	return Promise.all(packages.map((pkg) => resolvePlanEntry(pkg)));
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------

function renderTable(plan) {
	const rows = plan.map((entry) => ({
		package: entry.name,
		local: entry.version,
		registry: entry.registryVersion ?? "—",
		tag: entry.tag ?? "—",
		action: entry.action.toUpperCase(),
	}));

	const headers = ["package", "local", "registry", "tag", "action"];
	const widths = headers.map((header) => Math.max(header.length, ...rows.map((row) => String(row[header]).length)));
	const line = (cols) => cols.map((col, i) => String(col).padEnd(widths[i])).join("  ");

	console.log(line(headers));
	console.log(widths.map((width) => "-".repeat(width)).join("  "));
	for (const row of rows) {
		console.log(line(headers.map((header) => row[header])));
	}
}

function writeStepSummary(plan, { dryRun }) {
	if (!process.env.GITHUB_STEP_SUMMARY) {
		return;
	}

	const title = dryRun ? "Release plan (dry run)" : "Release";
	const lines = [
		`## ${title}`,
		"",
		"| Package | Local | Registry | Tag | Action |",
		"| --- | --- | --- | --- | --- |",
		...plan.map(
			(entry) =>
				`| \`${entry.name}\` | ${entry.version} | ${entry.registryVersion ?? "—"} | ${entry.tag ?? "—"} | ${entry.action} |`,
		),
		"",
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function writeOutputs(published) {
	if (!process.env.GITHUB_OUTPUT) {
		return;
	}

	const names = published.map((entry) => entry.name);
	appendFileSync(process.env.GITHUB_OUTPUT, `published-count=${names.length}\npublished-packages=${names.join(",")}\n`);
}

// ---------------------------------------------------------------------------
// Publishing.
// ---------------------------------------------------------------------------

/** Publish a single package with pnpm under exactly one dist-tag. Returns true on success. */
function publishPackage(entry, { dryRun }) {
	const args = ["--filter", entry.name, "publish", "--tag", entry.tag, "--access", "public", "--no-git-checks"];

	// Provenance attestations require the CI OIDC token (npm trusted
	// publishing), so the flag is only meaningful for a real publish — and
	// then it is REQUIRED, failing closed when no OIDC context is available.
	// A dry run just validates the tarball/packaging locally.
	if (dryRun) {
		args.push("--dry-run");
	} else {
		args.push("--provenance");
	}

	console.log(`\n$ pnpm ${args.join(" ")}`);
	const result = spawnSync("pnpm", args, { stdio: "inherit" });
	return result.status === 0;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(HELP);
		return;
	}

	const packages = orderByDependencies(listWorkspacePackages());

	// THE MAJOR CEILING — checked before any registry call so a bad manifest
	// aborts the run even when the registry is unreachable. v6 and above are
	// released from `main`, never from this branch.
	const ceilingViolations = packages.filter((pkg) => exceedsMajorCeiling(pkg.version));
	if (ceilingViolations.length > 0) {
		console.error(`Refusing to release — these versions cross the v${MAX_MAJOR} branch's major ceiling (< ${MAX_MAJOR + 1}.0.0):`);
		for (const pkg of ceilingViolations) {
			console.error(`  - ${pkg.name}@${pkg.version}`);
		}

		console.error(`\nKeyv v${MAX_MAJOR + 1} is released from the main branch. Nothing at or above ${MAX_MAJOR + 1}.0.0 (including pre-releases) may be published from the v${MAX_MAJOR} branch.`);
		process.exit(1);
	}

	const plan = await buildPlan(packages);

	if (args.json) {
		console.log(JSON.stringify(plan, null, 2));
		// The plan is still emitted for inspection, but a known-bad plan must
		// fail the run in every mode — automation keying off the exit code
		// must never mistake a refused release for a clean one.
		if (plan.some((entry) => entry.action === "error")) {
			process.exitCode = 1;
		}

		return;
	}

	console.log(`Registry: ${REGISTRY}\n`);
	renderTable(plan);
	writeStepSummary(plan, { dryRun: args.dryRun });

	// Fail closed on a known-bad plan before publishing anything (e.g. a
	// version that would move a dist-tag backwards). Reported even in a dry run.
	const errors = plan.filter((entry) => entry.action === "error");
	if (errors.length > 0) {
		console.error("\nRefusing to release — resolve these first:");
		for (const entry of errors) {
			console.error(`  - ${entry.name}: ${entry.reason}`);
		}

		console.error("\nBump each to a safe version, or drop it from this release.");
		process.exit(1);
	}

	const toPublish = plan.filter((entry) => entry.action === "publish");

	if (toPublish.length === 0) {
		console.log("\nNothing to publish — every package is already at its registry version.");
		writeOutputs([]);
		return;
	}

	console.log(
		`\n${args.dryRun ? "[dry run] would publish" : "Publishing"} ${toPublish.length} package(s): ${toPublish
			.map((entry) => `${entry.name}@${entry.version} → ${entry.tag}`)
			.join(", ")}`,
	);

	const published = [];
	const failed = [];
	for (const entry of toPublish) {
		// The plan was computed from a registry snapshot. Re-verify each
		// package against the live registry immediately before its real
		// publish so a concurrent release (e.g. v6 going GA from main while
		// this run is in flight) cannot slip a stale tag through the
		// backwards guard. A dry run keeps the snapshot plan — it publishes
		// nothing, so the race does not apply.
		let toRelease = entry;
		if (!args.dryRun) {
			const fresh = await resolvePlanEntry(entry);
			if (fresh.action === "skip") {
				console.log(`\nSkipping ${entry.name}@${entry.version} — ${fresh.reason} (registry changed since the plan was computed).`);
				continue;
			}

			if (fresh.action === "error") {
				console.error(`\nAborting before ${entry.name}@${entry.version}: ${fresh.reason} (registry changed since the plan was computed).`);
				failed.push(entry);
				break;
			}

			if (fresh.tag !== entry.tag) {
				console.log(`\nRetagging ${entry.name}@${entry.version}: "${entry.tag}" → "${fresh.tag}" (registry changed since the plan was computed).`);
			}

			toRelease = fresh;
		}

		const ok = publishPackage(toRelease, { dryRun: args.dryRun });
		if (ok) {
			published.push(toRelease);
			continue;
		}

		failed.push(entry);
		// Stop a real publish at the first failure: the list is in dependency
		// order, so releasing a dependent after its dependency failed would
		// reference a version that never made it to the registry. A dry run
		// keeps going to surface every packaging problem at once.
		if (!args.dryRun) {
			break;
		}
	}

	if (!args.dryRun) {
		writeOutputs(published);
	}

	console.log("");
	if (failed.length > 0) {
		console.error(`Failed to publish ${failed.length} package(s):`);
		for (const entry of failed) {
			console.error(`  - ${entry.name}@${entry.version}`);
		}

		const attempted = new Set([...published, ...failed].map((entry) => entry.name));
		const notAttempted = toPublish.filter((entry) => !attempted.has(entry.name));
		if (notAttempted.length > 0) {
			console.error("\nNot attempted (aborted after the failure above, in dependency order):");
			for (const entry of notAttempted) {
				console.error(`  - ${entry.name}@${entry.version}`);
			}
		}

		process.exit(1);
	}

	console.log(
		args.dryRun
			? `Dry run complete — ${toPublish.length} package(s) would be published.`
			: `Published ${published.length} package(s) successfully.`,
	);
}

// Only run when executed directly (e.g. `node scripts/release.mjs`), not when
// imported by release.test.mjs for the pure helpers above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message ?? error);
		process.exit(1);
	});
}
