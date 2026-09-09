import { describe, expect, it } from "vitest";
import {
	MAX_MAJOR,
	blockedBy,
	classifyStageFailure,
	compareSemver,
	computeTag,
	exceedsMajorCeiling,
	isDryRunRequested,
	packArgs,
	packedTarballFor,
	parseVersion,
	publishArgs,
	resolvePlanAction,
} from "./release.mjs";

describe("parseVersion", () => {
	it("parses a stable version", () => {
		expect(parseVersion("5.6.0")).toEqual({ major: 5, minor: 6, patch: 0, prerelease: undefined });
	});

	it("parses a pre-release version", () => {
		expect(parseVersion("6.0.0-beta.4")).toEqual({ major: 6, minor: 0, patch: 0, prerelease: "beta.4" });
	});

	it("accepts a leading v and drops build metadata", () => {
		expect(parseVersion("v5.4.2")).toMatchObject({ major: 5, minor: 4, patch: 2 });
		expect(parseVersion("5.4.2+build.7")).toMatchObject({ major: 5, minor: 4, patch: 2, prerelease: undefined });
	});

	it("throws on an unparseable version", () => {
		expect(() => parseVersion("not-a-version")).toThrow(/Unparseable/);
		expect(() => parseVersion("5.6")).toThrow(/Unparseable/);
		expect(() => parseVersion("")).toThrow(/Unparseable/);
	});
});

describe("exceedsMajorCeiling (the v5 branch MAJOR check)", () => {
	it("allows every major up to and including the ceiling", () => {
		expect(MAX_MAJOR).toBe(5);
		expect(exceedsMajorCeiling("1.1.2")).toBe(false);
		expect(exceedsMajorCeiling("4.1.0")).toBe(false);
		expect(exceedsMajorCeiling("5.6.0")).toBe(false);
		expect(exceedsMajorCeiling("5.999.999")).toBe(false);
	});

	it("refuses 6.0.0 — that line belongs to main", () => {
		expect(exceedsMajorCeiling("6.0.0")).toBe(true);
	});

	it("refuses 6.0.0 pre-releases even though they sort below 6.0.0", () => {
		expect(exceedsMajorCeiling("6.0.0-beta.1")).toBe(true);
		expect(exceedsMajorCeiling("6.0.0-alpha.3")).toBe(true);
	});

	it("refuses anything above the v6 line too", () => {
		expect(exceedsMajorCeiling("6.1.0")).toBe(true);
		expect(exceedsMajorCeiling("7.0.0")).toBe(true);
	});
});

describe("compareSemver", () => {
	it("orders by major, minor, patch", () => {
		expect(compareSemver("5.6.1", "5.6.0")).toBe(1);
		expect(compareSemver("5.6.0", "5.6.1")).toBe(-1);
		expect(compareSemver("5.6.0", "5.6.0")).toBe(0);
		expect(compareSemver("5.9.9", "6.0.0")).toBe(-1);
	});

	it("ranks a pre-release below its stable release", () => {
		expect(compareSemver("6.0.0-beta.4", "6.0.0")).toBe(-1);
		expect(compareSemver("6.0.0", "6.0.0-beta.4")).toBe(1);
	});

	it("ranks a stable version below a higher major's pre-release", () => {
		expect(compareSemver("5.9.9", "6.0.0-beta.1")).toBe(-1);
	});

	it("orders pre-release identifiers per semver", () => {
		expect(compareSemver("6.0.0-beta.2", "6.0.0-beta.1")).toBe(1);
		expect(compareSemver("6.0.0-alpha.3", "6.0.0-beta.1")).toBe(-1); // alpha < beta
		expect(compareSemver("6.0.0-beta", "6.0.0-beta.1")).toBe(-1); // fewer identifiers
		expect(compareSemver("6.0.0-1", "6.0.0-alpha")).toBe(-1); // numeric < alphanumeric
		expect(compareSemver("6.0.0-beta.1", "6.0.0-beta.1")).toBe(0);
	});

	it("compares numeric identifiers numerically, not lexicographically", () => {
		expect(compareSemver("6.0.0-beta.10", "6.0.0-beta.9")).toBe(1); // "10" < "9" as strings
		expect(compareSemver("6.0.0-beta.9", "6.0.0-beta.10")).toBe(-1);
		expect(compareSemver("6.0.0-rc.100", "6.0.0-rc.20")).toBe(1);
	});

	it("ignores build metadata", () => {
		expect(compareSemver("5.6.0+build.1", "5.6.0")).toBe(0);
	});
});

describe("computeTag", () => {
	it("tags a stable version latest when the registry has no latest yet", () => {
		expect(computeTag("5.6.1", {})).toMatchObject({ tag: "latest" });
	});

	it("tags a stable version latest when it moves latest forward", () => {
		expect(computeTag("5.6.1", { latest: "5.6.0" })).toMatchObject({ tag: "latest" });
		expect(computeTag("1.1.2", { latest: "1.1.1" })).toMatchObject({ tag: "latest" });
	});

	it("tags a maintenance release v{major}-lts once a newer major owns latest", () => {
		expect(computeTag("5.6.1", { latest: "6.0.0" })).toMatchObject({ tag: "v5-lts" });
		expect(computeTag("1.1.2", { latest: "6.0.0" })).toMatchObject({ tag: "v1-lts" });
		expect(computeTag("4.1.1", { latest: "6.0.0" })).toMatchObject({ tag: "v4-lts" });
	});

	it("refuses a stable rollback within the same major", () => {
		expect(computeTag("5.5.0", { latest: "5.6.0" }).error).toMatch(/behind registry latest/);
	});

	it("tags a pre-release to its channel, never latest", () => {
		expect(computeTag("5.7.0-beta.1", {})).toMatchObject({ tag: "beta" });
		expect(computeTag("5.7.0-rc.2", { latest: "5.6.0" })).toMatchObject({ tag: "rc" });
	});

	it("scopes the channel by major when a newer major owns it (main publishing 6.x betas)", () => {
		// This is the live registry state today: keyv's `beta` is 6.0.0-beta.4.
		expect(computeTag("5.7.0-beta.1", { latest: "5.6.0", beta: "6.0.0-beta.4" })).toMatchObject({
			tag: "v5-beta",
		});
	});

	it("keeps the plain channel when this line still owns it", () => {
		expect(computeTag("5.7.0-beta.2", { beta: "5.7.0-beta.1" })).toMatchObject({ tag: "beta" });
	});

	it("refuses a purely numeric pre-release channel (npm rejects semver-ish tags)", () => {
		expect(computeTag("5.7.0-0", {}).error).toMatch(/no usable channel name/);
	});

	it("refuses reserved channel names — a pre-release must never reach latest or an lts tag", () => {
		expect(computeTag("5.7.0-latest.1", { latest: "5.6.0" }).error).toMatch(/reserved channel "latest"/);
		expect(computeTag("5.7.0-lts.1", {}).error).toMatch(/reserved channel "lts"/);
		expect(computeTag("5.7.0-v5-lts.1", {}).error).toMatch(/reserved channel "v5-lts"/);
		expect(computeTag("5.7.0-Latest.1", { latest: "5.6.0" }).error).toMatch(/reserved channel/); // case-insensitive
	});

	it("refuses semver-range-like channel names that npm would reject as dist-tags", () => {
		expect(computeTag("5.7.0-x.1", {}).error).toMatch(/reserved channel "x"/);
		expect(computeTag("5.7.0-v5.2", {}).error).toMatch(/reserved channel "v5"/);
	});

	it("never yields the latest tag for any pre-release", () => {
		for (const version of ["5.7.0-beta.1", "5.7.0-latest.1", "5.7.0-rc.1", "5.7.0-next.2", "5.7.0-0"]) {
			const plan = computeTag(version, { latest: "5.6.0" });
			expect(plan.tag === "latest").toBe(false);
		}
	});
});

describe("resolvePlanAction", () => {
	const pkg = (name, version) => ({ name, version, path: `/repo/packages/${name}` });

	it("refuses a never-published package — a first publish cannot use OIDC trusted publishing", () => {
		const entry = resolvePlanAction(pkg("@keyv/new", "1.0.0"), null);
		expect(entry.action).toBe("error");
		expect(entry.reason).toMatch(/never published/);
		expect(resolvePlanAction(pkg("@keyv/new", "1.0.0-beta.1"), null).action).toBe("error");
	});

	it("skips a version that is already on the registry", () => {
		const doc = { versions: { "5.6.0": {} }, "dist-tags": { latest: "5.6.0" } };
		expect(resolvePlanAction(pkg("keyv", "5.6.0"), doc)).toMatchObject({ action: "skip", registryVersion: "5.6.0" });
	});

	it("publishes a new patch to latest while v5 still owns latest", () => {
		// Mirrors the real keyv document today: latest 5.6.0, beta 6.0.0-beta.4.
		const doc = {
			versions: { "5.6.0": {} },
			"dist-tags": { latest: "5.6.0", beta: "6.0.0-beta.4", alpha: "6.0.0-alpha.3", next: "5.0.0-rc.1" },
		};
		expect(resolvePlanAction(pkg("keyv", "5.6.1"), doc)).toMatchObject({ action: "publish", tag: "latest" });
	});

	it("publishes a new patch to v5-lts once v6 GA owns latest", () => {
		const doc = { versions: { "5.6.0": {}, "6.0.0": {} }, "dist-tags": { latest: "6.0.0" } };
		expect(resolvePlanAction(pkg("keyv", "5.6.1"), doc)).toMatchObject({ action: "publish", tag: "v5-lts" });
	});

	it("refuses a stable rollback within the same major", () => {
		const doc = { versions: { "5.6.0": {} }, "dist-tags": { latest: "5.6.0" } };
		const entry = resolvePlanAction(pkg("keyv", "5.5.9"), doc);
		expect(entry.action).toBe("error");
		expect(entry.reason).toMatch(/behind registry latest/);
	});

	it("refuses to move the v5-lts tag backwards", () => {
		const doc = {
			versions: { "5.6.1": {}, "6.0.0": {} },
			"dist-tags": { latest: "6.0.0", "v5-lts": "5.6.1" },
		};
		const entry = resolvePlanAction(pkg("keyv", "5.6.0"), doc);
		expect(entry.action).toBe("error");
		expect(entry.reason).toMatch(/would move dist-tag "v5-lts" backwards/);
	});

	it("refuses to move a same-major pre-release channel backwards", () => {
		const doc = { versions: {}, "dist-tags": { beta: "5.8.0-beta.1" } };
		const entry = resolvePlanAction(pkg("keyv", "5.7.0-beta.1"), doc);
		expect(entry.action).toBe("error");
		expect(entry.reason).toMatch(/would move dist-tag "beta" backwards/);
	});

	it("refuses to move a major-scoped channel backwards after falling back to it", () => {
		const doc = {
			versions: {},
			"dist-tags": { beta: "6.0.0-beta.4", "v5-beta": "5.8.0-beta.1" },
		};
		const entry = resolvePlanAction(pkg("keyv", "5.7.0-beta.1"), doc);
		expect(entry.action).toBe("error");
		expect(entry.reason).toMatch(/would move dist-tag "v5-beta" backwards/);
	});

	it("handles a registry document without dist-tags", () => {
		const doc = { versions: { "1.0.0": {} } };
		expect(resolvePlanAction(pkg("@keyv/x", "1.0.1"), doc)).toMatchObject({ action: "publish", tag: "latest" });
	});
});

describe("packedTarballFor / packArgs", () => {
	it("flattens scoped names into a ./packed tarball path", () => {
		expect(packedTarballFor("keyv")).toBe("./packed/keyv.tgz");
		expect(packedTarballFor("@keyv/redis")).toBe("./packed/keyv-redis.tgz");
	});

	it("packs a workspace package to that tarball path", () => {
		expect(packArgs("keyv")).toEqual(["--filter", "keyv", "pack", "--out", "./packed/keyv.tgz"]);
	});
});

describe("publishArgs", () => {
	it("builds the exact pnpm stage publish command for a tarball + tag", () => {
		expect(publishArgs("./packed/keyv.tgz", "beta")).toEqual([
			"stage",
			"publish",
			"./packed/keyv.tgz",
			"--registry",
			"https://registry.npmjs.org",
			"--tag",
			"beta",
			"--access",
			"public",
			"--no-git-checks",
			"--provenance",
		]);
	});

	it("uses the given tarball and tag", () => {
		expect(`pnpm ${publishArgs("./packed/keyv-redis.tgz", "v5-lts").join(" ")}`).toBe(
			"pnpm stage publish ./packed/keyv-redis.tgz --registry https://registry.npmjs.org --tag v5-lts --access public --no-git-checks --provenance",
		);
	});

	it("always includes --provenance on a real stage (required for npm provenance attestation)", () => {
		expect(publishArgs("./packed/keyv.tgz", "latest")).toContain("--provenance");
		expect(publishArgs("./packed/keyv-redis.tgz", "beta")).toContain("--provenance");
	});

	it("uses --dry-run instead of --provenance for a dry run", () => {
		const args = publishArgs("./packed/keyv.tgz", "latest", { dryRun: true });
		expect(args).toContain("--dry-run");
		expect(args).not.toContain("--provenance");
	});
});

describe("publishArgs (staging invariants)", () => {
	it("always stages — never a direct publish", () => {
		for (const dryRun of [false, true]) {
			expect(publishArgs("./packed/keyv.tgz", "latest", { dryRun }).slice(0, 2)).toEqual(["stage", "publish"]);
		}
	});

	it("pins the registry, requires public access and skips git checks in both modes", () => {
		for (const dryRun of [false, true]) {
			const args = publishArgs("./packed/keyv.tgz", "beta", { dryRun });
			expect(args).toContain("--no-git-checks");
			expect(args.slice(args.indexOf("--access"), args.indexOf("--access") + 2)).toEqual(["--access", "public"]);
			expect(args.slice(args.indexOf("--registry"), args.indexOf("--registry") + 2)).toEqual([
				"--registry",
				"https://registry.npmjs.org",
			]);
		}
	});
});

describe("isDryRunRequested", () => {
	it("honors the --dry-run flag", () => {
		expect(isDryRunRequested({ dryRun: true }, {})).toBe(true);
	});

	it("honors DRY_RUN=true from the workflow", () => {
		expect(isDryRunRequested({ dryRun: false }, { DRY_RUN: "true" })).toBe(true);
	});

	it("is a real stage otherwise", () => {
		expect(isDryRunRequested({ dryRun: false }, {})).toBe(false);
		expect(isDryRunRequested({ dryRun: false }, { DRY_RUN: "false" })).toBe(false);
		expect(isDryRunRequested({ dryRun: false }, { DRY_RUN: "" })).toBe(false);
	});
});

describe("blockedBy (dependents of a failed package are not staged)", () => {
	it("blocks an adapter when keyv failed to stage", () => {
		expect(blockedBy({ name: "@keyv/redis", internalDeps: ["keyv"] }, new Set(["keyv"]))).toEqual(["keyv"]);
	});

	it("blocks keyv when @keyv/serialize failed to stage", () => {
		expect(blockedBy({ name: "keyv", internalDeps: ["@keyv/serialize"] }, new Set(["@keyv/serialize"]))).toEqual([
			"@keyv/serialize",
		]);
	});

	it("does not block on an unrelated failure", () => {
		expect(blockedBy({ name: "@keyv/redis", internalDeps: ["keyv"] }, new Set(["@keyv/mongo"]))).toEqual([]);
	});

	it("never blocks a package without workspace dependencies", () => {
		expect(blockedBy({ name: "@keyv/serialize", internalDeps: [] }, new Set(["keyv"]))).toEqual([]);
		expect(blockedBy({ name: "@keyv/serialize" }, new Set(["keyv"]))).toEqual([]);
	});

	it("lists every failed dependency", () => {
		expect(
			blockedBy({ name: "@keyv/compress-gzip", internalDeps: ["@keyv/serialize", "keyv"] }, new Set(["keyv", "@keyv/serialize"])),
		).toEqual(["@keyv/serialize", "keyv"]);
	});
});

describe("classifyStageFailure", () => {
	it("recognizes a duplicate-version rejection from the registry", () => {
		expect(classifyStageFailure("ERR_PNPM_FAILED_TO_PUBLISH  Failed to publish package keyv@5.6.1 (status 409 Conflict): {}")).toBe(
			"conflict",
		);
		expect(classifyStageFailure("npm error 403 You cannot publish over the previously published versions: 5.6.1.")).toBe(
			"conflict",
		);
		expect(classifyStageFailure("cannot publish a version that already exists as a staged version")).toBe("conflict");
		expect(classifyStageFailure("version 5.6.1 is already staged")).toBe("conflict");
	});

	it("treats anything else as a plain failure", () => {
		expect(classifyStageFailure("Failed to publish package keyv@5.6.1 (status 500 Internal Server Error): {}")).toBe("failure");
		expect(classifyStageFailure("Failed to publish package keyv@5.6.1 (status 4090 Weird): {}")).toBe("failure");
		expect(classifyStageFailure("ENOENT: no such file or directory")).toBe("failure");
		expect(classifyStageFailure("")).toBe("failure");
		expect(classifyStageFailure(undefined)).toBe("failure");
	});
});
