#!/usr/bin/env node
/**
 * Release orchestrator for the Keyv v5 maintenance branch.
 *
 * Versions are set **manually** (each package's `version` in package.json is
 * bumped by a human / release PR). This script never changes versions. Its job
 * is to decide, for every publishable workspace package, whether the locally
 * declared version still needs to be released — and under which dist-tag —
 * and, unless running a dry run, to STAGE the ones that do on npm.
 *
 * ## Staged publishing — nothing goes live from CI
 *
 * This script never runs `pnpm publish`. It packs each package and runs
 * `pnpm stage publish`, which uploads the tarball to npm's stage queue
 * together with a provenance attestation. A maintainer then reviews and
 * approves each staged version with 2FA — `pnpm stage list`,
 * `pnpm stage view <id>`, `pnpm stage approve <id>…` (or the "Staged
 * Packages" tab on npmjs.com) — and only then does it become installable.
 * The npm trusted publisher for the release workflow is configured
 * stage-only, so CI could not publish live even if it tried.
 *
 * ## The v5 branch context
 *
 * Keyv v6 is developed and released from `main` (all of its packages are on
 * the 6.x line). This branch is the v5 maintenance line, so two invariants are
 * enforced mechanically:
 *
 *   1. THE MAJOR CEILING — no package on this branch may ever stage a
 *      version whose major is above MAX_MAJOR (5). 6.0.0, 6.0.0-beta.1 and
 *      anything higher belong to `main`; the run aborts before any registry
 *      call if a manifest crosses the ceiling.
 *   2. `latest` (and every other dist-tag) never moves backwards. Once v6 GA
 *      owns `latest`, v5 releases automatically stage under `v5-lts`
 *      instead — same convention as main's release-publish.ts — with no
 *      workflow variable to flip on this branch.
 *
 * ## How "needs staging" is decided
 *
 *   1. Enumerate workspace packages with `pnpm -r ls --depth -1 --json`.
 *   2. Drop packages that are `private` or explicitly ignored (see
 *      IGNORED_PACKAGES) — these are never published to npm.
 *   3. Refuse the whole run if any package version crosses the major ceiling.
 *   4. For each remaining package, fetch its document from the npm registry:
 *        - 404            → never published → REFUSED (npm cannot stage a
 *          brand-new package and trusted publishing cannot create one; a
 *          maintainer creates it on npm once by hand — the single documented
 *          exception to "never publish directly", see "New packages" in
 *          changelog/README.md — then re-runs)
 *        - version listed → this exact version is already on npm    → skip
 *        - version absent → a newer (manually-set) version is ready → stage
 *   5. The full plan — including each package's dist-tag — is computed before
 *      anything is staged. If the registry state of any package cannot be
 *      determined (after retries), the run aborts *before* staging anything:
 *      a release is all-or-nothing on a known plan, never a partial guess.
 *   6. Immediately before each real stage the package is re-verified against
 *      the live registry under the same rules, so a concurrent release from
 *      another branch (e.g. v6 going GA from main mid-run) cannot race the
 *      snapshot the plan was computed from.
 *
 * Versions that are staged but not yet approved are NOT part of the public
 * registry document, and listing the stage queue needs credentials CI does
 * not have. So a re-run before approval attempts them again; the registry
 * rejects the duplicate and the run reports it as a conflict — approve or
 * reject the existing staged version in the queue instead of re-staging.
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
 * Whatever tag is computed, the stage is refused if it would move that
 * dist-tag backwards on the registry.
 *
 * The tag is fixed when a version is STAGED but only applied when it is
 * APPROVED. If the registry moves in between — e.g. v6 goes GA and takes
 * `latest` while keyv@5.x sits in the queue tagged `latest` — approving would
 * move `latest` backwards. Approve promptly; if the registry moved, reject the
 * staged version (`pnpm stage reject <id>`) and re-run this workflow so the
 * tag is recomputed (`v5-lts`).
 *
 * ## Stage order, failure policy and authentication
 *
 * Staging happens in **dependency order** (topological sort over the
 * workspace's runtime deps — dependencies, optionalDependencies and
 * peerDependencies): a package is always staged after the workspace packages
 * it relies on, because pnpm rewrites each `workspace:^` reference to the
 * dependency's concrete version at pack time, and a dependent must never be
 * approved ahead of a dependency it points at. Because nothing goes live at
 * stage time, a failure does not abort the run: unrelated packages are still
 * staged, but any package whose workspace dependency failed to stage is
 * skipped. Every failure is reported and the run exits non-zero.
 *
 * Each package is packed with pnpm, then the tarball is staged with
 * provenance, so packages are cryptographically linked to this repo +
 * workflow when run from CI with an OIDC `id-token: write` permission
 * (npm trusted publishing — no NPM_TOKEN):
 *
 *     pnpm --filter <name> pack --out ./packed/<name>.tgz
 *     pnpm stage publish ./packed/<name>.tgz --registry <registry> --tag <tag> --access public --no-git-checks --provenance
 *
 * ## Usage
 *
 *   node scripts/release.mjs              # stage every package whose version is new
 *   node scripts/release.mjs --dry-run    # print the plan + validate packaging (pack), stage nothing
 *   node scripts/release.mjs --json       # emit the plan as JSON (implies no staging noise)
 *
 * ## Environment
 *
 *   DRY_RUN               "true" behaves like --dry-run (how the workflow passes its input)
 *   NPM_CONFIG_REGISTRY   override the registry queried + staged to (default: npmjs.org)
 *   GITHUB_STEP_SUMMARY   when set, a markdown summary is appended to it
 *   GITHUB_OUTPUT         when set, `staged-count` / `staged-packages` outputs are written
 *
 * Exit codes: 0 = success (including "nothing to stage"); non-zero = the
 * major ceiling was crossed, a dist-tag would move backwards, a registry
 * lookup failed, or a pack/stage failed (including packages skipped because
 * a workspace dependency of theirs failed).
 *
 * The pure helpers (parseVersion / compareSemver / computeTag /
 * resolvePlanAction / blockedBy / packedTarballFor / packArgs / stageArgs /
 * classifyStageFailure / isDryRunRequested) are exported and unit-tested in
 * release.test.mjs; main() only executes when the file is run directly, so
 * importing it for tests has no side effects.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REGISTRY = (process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org").replace(/\/$/, "");

// Monorepo root, resolved relative to this file (scripts/ lives one level
// down), so pack output and pnpm invocations don't depend on the caller's cwd.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * THE MAJOR CEILING for this branch. Keyv v6 is the line released from
 * `main`, so nothing on the v5 branch may ever stage a version at or above
 * 6.0.0 — including 6.0.0 pre-releases, which is why the check is on the
 * major number rather than full semver precedence (6.0.0-beta.1 sorts below
 * 6.0.0 but still belongs to main's line).
 */
export const MAX_MAJOR = 5;

/**
 * Packages that live in the workspace and are *not* marked `private`, yet
 * should never be published to npm. Keep this list small and documented —
 * removing a name here is all it takes to start staging that package.
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
  node scripts/release.mjs            Stage every package whose version is not yet on npm
  node scripts/release.mjs --dry-run  Print the plan and validate packaging without staging
  node scripts/release.mjs --json     Emit the stage plan as JSON

Versions are set manually; this script never bumps them. No version may be
6.0.0 or higher — v6 is released from the main branch. Nothing goes live from
here: staged versions must be approved by a maintainer with 2FA
(pnpm stage list / pnpm stage view <id> / pnpm stage approve <id>...).`;

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
 * Decide which dist-tag a version stages under, from that package's own
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
		// staged under the `latest` dist-tag.
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
 * where action is "publish" (= stage it) | "skip" | "error".
 */
export function resolvePlanAction(pkg, doc) {
	if (doc === null) {
		// npm cannot stage a brand-new package, and a first-ever publish cannot
		// authenticate via OIDC trusted publishing (the trusted-publisher config
		// lives on an existing package), so a brand-new package would only fail
		// mid-run. Refuse at plan time instead. Creating the package on npm is a
		// deliberate one-time manual step for a maintainer (the documented
		// exception under "New packages" in changelog/README.md) — never
		// something this script does.
		return {
			...pkg,
			registryVersion: null,
			tag: null,
			action: "error",
			reason:
				'never published — npm cannot stage a brand-new package; a maintainer must create it on npm once by hand (see "New packages" in changelog/README.md), then re-run',
		};
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

/**
 * The workspace dependencies of `entry` that already failed in this run. A
 * non-empty result means the package must not be staged: pnpm rewrote its
 * `workspace:^` references to versions that never reached the stage queue, so
 * approving it would point consumers at a version that does not exist.
 *
 * @param entry       A plan entry carrying `internalDeps` (set by orderByDependencies).
 * @param failedNames Set of package names that failed (or were skipped) so far.
 */
export function blockedBy(entry, failedNames) {
	return (entry.internalDeps ?? []).filter((dep) => failedNames.has(dep));
}

/**
 * Relative tarball path for a workspace package (`./` prefix so pnpm treats
 * it as a local path). Scoped names are flattened (`@keyv/redis` ->
 * `keyv-redis`). Resolved against the repo root by the pnpm invocations.
 */
export function packedTarballFor(name) {
	return `./packed/${name.replace(/^@/, "").replaceAll("/", "-")}.tgz`;
}

/** Pack a workspace package to its known tarball path under `./packed/`. */
export function packArgs(name) {
	return ["--filter", name, "pack", "--out", packedTarballFor(name)];
}

/**
 * The exact `pnpm` argument list used to stage a packed tarball — the single
 * source of truth so the same command is both printed and executed. Flags:
 * `--registry` pins the stage to the SAME registry the plan was computed
 * against (an NPM_CONFIG_REGISTRY override can never plan against one
 * registry and stage to another); `--tag` applies exactly one dist-tag;
 * `--access public` (required for the scoped `@keyv/*` packages);
 * `--no-git-checks` (git checks run even for a tarball and would fail on the
 * untracked pack output); `--provenance` (REQUIRED: generates the npm
 * provenance attestation from the CI OIDC context so every staged package is
 * verifiably built here — it fails closed when no OIDC context is available,
 * and release.test.mjs asserts the flag is always present); `--dry-run`
 * (dry runs only) does everything except upload to the registry.
 */
export function stageArgs(entry, { dryRun = false, registry = REGISTRY } = {}) {
	const args = [
		"stage",
		"publish",
		packedTarballFor(entry.name),
		"--registry",
		registry,
		"--tag",
		entry.tag,
		"--access",
		"public",
		"--no-git-checks",
		"--provenance",
	];

	if (dryRun) {
		args.push("--dry-run");
	}

	return args;
}

/**
 * Best-effort classification of a failed `pnpm stage publish`. Staged versions
 * share npm's version index with published ones, so re-staging a version that
 * is already in the queue (typical after a partial run, before approval) is
 * rejected by the registry. That case only changes the hint shown to the
 * maintainer — every failure still fails the run.
 *
 * @returns "conflict" when the output looks like a duplicate-version rejection, else "failure".
 */
export function classifyStageFailure(output) {
	const text = String(output ?? "");
	return /\(status 409\b|already (?:staged|exists)|previously (?:staged|published)|staged version/i.test(text)
		? "conflict"
		: "failure";
}

/**
 * Whether this run is a dry run: the `--dry-run` CLI flag, or `DRY_RUN=true`
 * in the environment (how the release workflow passes its input through
 * without interpolating anything into the shell command).
 */
export function isDryRunRequested(args, env = process.env) {
	return Boolean(args.dryRun) || env.DRY_RUN === "true";
}

// ---------------------------------------------------------------------------
// Workspace + registry IO.
// ---------------------------------------------------------------------------

/** Enumerate publishable workspace packages via pnpm (respects pnpm-workspace.yaml). */
function listWorkspacePackages() {
	const result = spawnSync("pnpm", ["-r", "ls", "--depth", "-1", "--json"], {
		cwd: rootDir,
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
	// Only runtime-facing deps are rewritten into the packed manifest and
	// thus constrain stage order — devDependencies are not installed by
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
 * peer-depend on keyv. Each returned package carries its `internalDeps` so
 * the stage loop can skip dependents of a failed package. Throws on a
 * dependency cycle.
 */
function orderByDependencies(packages) {
	const workspaceNames = new Set(packages.map((pkg) => pkg.name));
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const deps = new Map(packages.map((pkg) => [pkg.name, readInternalDeps(pkg, workspaceNames)]));

	const ordered = [];
	const emitted = new Set();
	let remaining = packages.map((pkg) => pkg.name).sort();

	while (remaining.length > 0) {
		const ready = remaining.filter((name) => deps.get(name).every((dep) => emitted.has(dep)));
		if (ready.length === 0) {
			throw new Error(`dependency cycle among workspace packages: ${remaining.join(", ")}`);
		}

		for (const name of ready) {
			ordered.push({ ...byName.get(name), internalDeps: deps.get(name) });
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

/** Resolve whether (and under which tag) a single package needs staging. */
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

/** Human-facing label for a plan action ("publish" means "stage it"). */
function actionLabel(action) {
	return action === "publish" ? "STAGE" : action.toUpperCase();
}

function renderTable(plan) {
	const rows = plan.map((entry) => ({
		package: entry.name,
		local: entry.version,
		registry: entry.registryVersion ?? "—",
		tag: entry.tag ?? "—",
		action: actionLabel(entry.action),
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

function appendSummary(lines) {
	if (!process.env.GITHUB_STEP_SUMMARY) {
		return;
	}

	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function writeStepSummary(plan, { dryRun }) {
	const title = dryRun ? "Stage plan (dry run)" : "Stage plan";
	appendSummary([
		`## ${title}`,
		"",
		"| Package | Local | Registry | Tag | Action |",
		"| --- | --- | --- | --- | --- |",
		...plan.map(
			(entry) =>
				`| \`${entry.name}\` | ${entry.version} | ${entry.registryVersion ?? "—"} | ${entry.tag ?? "—"} | ${actionLabel(entry.action).toLowerCase()} |`,
		),
		"",
	]);
}

/** The maintainer-facing approval instructions, printed after a real stage. */
const APPROVAL_STEPS = [
	"pnpm stage list                 # staged versions awaiting approval",
	"pnpm stage view <stage-id>      # verify version, dist-tag and provenance",
	"pnpm stage approve <stage-id>…  # promotes to the registry (2FA); approve dependencies first",
];

function writeResultSummary({ staged, failed, notAttempted, dryRun }) {
	const lines = [];
	if (staged.length > 0) {
		lines.push(`### ${dryRun ? "Would stage" : "Staged for approval"}`, "");
		for (const entry of staged) {
			lines.push(`- \`${entry.name}@${entry.version}\` → \`${entry.tag}\``);
		}
		lines.push("");
		if (!dryRun) {
			lines.push(
				"Nothing is live yet. Approve in dependency order (`@keyv/serialize` → `keyv` → adapters) with 2FA:",
				"",
				"```sh",
				...APPROVAL_STEPS,
				"```",
				"",
				"Approve promptly: the dist-tag is applied at approval time. If `latest` moved to a newer major since staging, `pnpm stage reject` the staged version and re-run this workflow.",
				"",
			);
		}
	}

	if (failed.length > 0 || notAttempted.length > 0) {
		lines.push("### Failed", "");
		for (const { entry, reason } of failed) {
			lines.push(`- \`${entry.name}@${entry.version}\`: ${reason}`);
		}
		for (const { entry, blockers } of notAttempted) {
			lines.push(`- \`${entry.name}@${entry.version}\`: not attempted — depends on ${blockers.join(", ")}, which failed`);
		}
		lines.push("");
	}

	appendSummary(lines);
}

function writeOutputs(staged) {
	if (!process.env.GITHUB_OUTPUT) {
		return;
	}

	const names = staged.map((entry) => entry.name);
	appendFileSync(process.env.GITHUB_OUTPUT, `staged-count=${names.length}\nstaged-packages=${names.join(",")}\n`);
}

// ---------------------------------------------------------------------------
// Staging.
// ---------------------------------------------------------------------------

/** Maintainer-facing explanation for a failed stagePackage result. */
function describeFailure(result) {
	switch (result.kind) {
		case "pack":
			return "pnpm pack failed (see log above)";
		case "conflict":
			return "the registry rejected the version as a duplicate — most likely it is already in the stage queue from an earlier run; check `pnpm stage list <name>` and approve or reject it there instead of re-staging";
		default:
			return "pnpm stage publish failed (see log above)";
	}
}

/**
 * Pack a single package, then stage the tarball under exactly one dist-tag.
 * Packing happens in dry runs too (it validates the tarball the way the old
 * `publish --dry-run` did); the stage step then runs with `--dry-run`, which
 * does everything except upload. Returns `{ ok: true }` or
 * `{ ok: false, kind: "pack" | "conflict" | "failure" }`.
 */
function stagePackage(entry, { dryRun }) {
	mkdirSync(path.join(rootDir, "packed"), { recursive: true });

	const pack = packArgs(entry.name);
	console.log(`\n$ pnpm ${pack.join(" ")}`);
	const packed = spawnSync("pnpm", pack, { cwd: rootDir, stdio: "inherit" });
	if (packed.status !== 0) {
		return { ok: false, kind: "pack" };
	}

	const stage = stageArgs(entry, { dryRun });
	console.log(`$ pnpm ${stage.join(" ")}`);
	// Capture the output so a registry rejection can be classified, then echo
	// it so the job log still shows everything pnpm/npm printed.
	const result = spawnSync("pnpm", stage, {
		cwd: rootDir,
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	});
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.error) console.error(result.error.message);

	if (result.status === 0) {
		return { ok: true };
	}

	return { ok: false, kind: classifyStageFailure(`${result.stdout ?? ""}\n${result.stderr ?? ""}`) };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(HELP);
		return;
	}

	const dryRun = isDryRunRequested(args);
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

		console.error(`\nKeyv v${MAX_MAJOR + 1} is released from the main branch. Nothing at or above ${MAX_MAJOR + 1}.0.0 (including pre-releases) may be staged from the v${MAX_MAJOR} branch.`);
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

	console.log(`Registry: ${REGISTRY}`);
	console.log(`Mode:     ${dryRun ? "DRY RUN — nothing will be staged" : "STAGE — nothing goes live until approved"}\n`);
	renderTable(plan);
	writeStepSummary(plan, { dryRun });

	// Fail closed on a known-bad plan before staging anything (e.g. a
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

	const toStage = plan.filter((entry) => entry.action === "publish");

	if (toStage.length === 0) {
		console.log("\nNothing to stage — every package is already at its registry version.");
		writeOutputs([]);
		return;
	}

	console.log(
		`\n${dryRun ? "[dry run] would stage" : "Staging"} ${toStage.length} package(s): ${toStage
			.map((entry) => `${entry.name}@${entry.version} → ${entry.tag}`)
			.join(", ")}`,
	);

	const staged = [];
	const failed = []; // { entry, reason }
	const notAttempted = []; // { entry, blockers }
	const failedNames = new Set();
	for (const entry of toStage) {
		// Never stage a package whose workspace dependency did not make it to
		// the queue: its packed manifest points at a version that would not
		// exist. Unrelated packages keep going — nothing is live at this point.
		const blockers = blockedBy(entry, failedNames);
		if (blockers.length > 0) {
			console.log(`\nSkipping ${entry.name}@${entry.version} — depends on ${blockers.join(", ")}, which failed to stage.`);
			notAttempted.push({ entry, blockers });
			failedNames.add(entry.name);
			continue;
		}

		// The plan was computed from a registry snapshot. Re-verify each
		// package against the live registry immediately before its real
		// stage so a concurrent release (e.g. v6 going GA from main while
		// this run is in flight) cannot slip a stale tag through the
		// backwards guard. A dry run keeps the snapshot plan — it stages
		// nothing, so the race does not apply.
		let toRelease = entry;
		if (!dryRun) {
			const fresh = await resolvePlanEntry(entry);
			if (fresh.action === "skip") {
				console.log(`\nSkipping ${entry.name}@${entry.version} — ${fresh.reason} (registry changed since the plan was computed).`);
				continue;
			}

			if (fresh.action === "error") {
				console.error(`\nNot staging ${entry.name}@${entry.version}: ${fresh.reason} (registry changed since the plan was computed).`);
				failed.push({ entry, reason: fresh.reason });
				failedNames.add(entry.name);
				continue;
			}

			if (fresh.tag !== entry.tag) {
				console.log(`\nRetagging ${entry.name}@${entry.version}: "${entry.tag}" → "${fresh.tag}" (registry changed since the plan was computed).`);
			}

			toRelease = fresh;
		}

		const result = stagePackage(toRelease, { dryRun });
		if (result.ok) {
			staged.push(toRelease);
			continue;
		}

		const reason = describeFailure(result);
		console.error(`\n✖ ${toRelease.name}@${toRelease.version}: ${reason}`);
		failed.push({ entry: toRelease, reason });
		failedNames.add(toRelease.name);
	}

	writeResultSummary({ staged, failed, notAttempted, dryRun });
	if (!dryRun) {
		writeOutputs(staged);
	}

	console.log("");
	if (failed.length > 0 || notAttempted.length > 0) {
		console.error(`Failed to ${dryRun ? "validate" : "stage"} ${failed.length + notAttempted.length} package(s):`);
		for (const { entry, reason } of failed) {
			console.error(`  - ${entry.name}@${entry.version}: ${reason}`);
		}
		for (const { entry, blockers } of notAttempted) {
			console.error(`  - ${entry.name}@${entry.version}: not attempted — depends on ${blockers.join(", ")}, which failed`);
		}

		if (staged.length > 0) {
			console.error(
				`\n${dryRun ? "Would still stage" : "Staged"} ${staged.length} package(s): ${staged.map((entry) => `${entry.name}@${entry.version}`).join(", ")}`,
			);
		}

		process.exit(1);
	}

	if (dryRun) {
		console.log(`Dry run complete — ${staged.length} package(s) would be staged.`);
		return;
	}

	console.log(`Staged ${staged.length} package(s) — nothing is live until a maintainer approves them with 2FA:`);
	for (const entry of staged) {
		console.log(`  - ${entry.name}@${entry.version} → ${entry.tag}`);
	}
	console.log("\nApprove in dependency order (@keyv/serialize → keyv → adapters):");
	for (const step of APPROVAL_STEPS) {
		console.log(`  ${step}`);
	}
}

// Only run when executed directly (e.g. `node scripts/release.mjs`), not when
// imported by release.test.mjs for the pure helpers above.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message ?? error);
		process.exit(1);
	});
}
