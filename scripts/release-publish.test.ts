import { describe, expect, test } from "vitest";
import { computeDistTag, isVersionGte, packArgs, packedTarballFor, parseVersion, publishArgs } from "./release-publish.ts";

describe("parseVersion", () => {
	test("parses a stable version", () => {
		expect(parseVersion("5.4.2")).toEqual({ major: 5, minor: 4, patch: 2, prerelease: undefined });
	});

	test("parses a pre-release version", () => {
		expect(parseVersion("6.0.0-beta.1")).toEqual({ major: 6, minor: 0, patch: 0, prerelease: "beta.1" });
	});

	test("tolerates a leading v", () => {
		expect(parseVersion("v6.0.0").major).toBe(6);
	});

	test("throws on garbage", () => {
		expect(() => parseVersion("not-a-version")).toThrow(/Unparseable/);
	});
});

describe("computeDistTag", () => {
	test("pre-release -> channel tag, never latest", () => {
		const plan = computeDistTag("6.0.0-beta.1", 5);
		expect(plan.tag).toBe("beta");
		expect(plan.setsLatest).toBe(false);
	});

	test("rc pre-release -> rc channel", () => {
		expect(computeDistTag("6.1.0-rc.2", 5).tag).toBe("rc");
	});

	test("stable current major -> latest", () => {
		const plan = computeDistTag("5.4.2", 5);
		expect(plan.tag).toBe("latest");
		expect(plan.setsLatest).toBe(true);
	});

	test("stable old major -> v{major}-lts, never latest", () => {
		const plan = computeDistTag("5.4.2", 6);
		expect(plan.tag).toBe("v5-lts");
		expect(plan.setsLatest).toBe(false);
	});

	test("stable current major after GA bump -> latest", () => {
		const plan = computeDistTag("6.0.0", 6);
		expect(plan.tag).toBe("latest");
		expect(plan.setsLatest).toBe(true);
	});

	test("legacy major -> v4-lts", () => {
		expect(computeDistTag("4.5.1", 6).tag).toBe("v4-lts");
	});

	test("stable release requires LATEST_MAJOR", () => {
		expect(() => computeDistTag("5.4.2", undefined)).toThrow(/LATEST_MAJOR/);
	});

	test("pre-release does not require LATEST_MAJOR", () => {
		expect(computeDistTag("6.0.0-beta.1", undefined).tag).toBe("beta");
	});
});

describe("isVersionGte (downgrade guard)", () => {
	test("higher patch is gte", () => {
		expect(isVersionGte("5.4.3", "5.4.2")).toBe(true);
	});

	test("equal is gte", () => {
		expect(isVersionGte("5.4.2", "5.4.2")).toBe(true);
	});

	test("lower version is not gte (blocks downgrade)", () => {
		expect(isVersionGte("5.4.1", "5.4.2")).toBe(false);
	});

	test("old major is not gte a newer latest (blocks clobber)", () => {
		expect(isVersionGte("5.9.9", "6.0.0")).toBe(false);
	});

	test("stable outranks same-triple pre-release", () => {
		expect(isVersionGte("6.0.0", "6.0.0-beta.1")).toBe(true);
	});
});

describe("packedTarballFor / packArgs", () => {
	test("flattens scoped names into a ./packed tarball path", () => {
		expect(packedTarballFor("keyv")).toBe("./packed/keyv.tgz");
		expect(packedTarballFor("@keyv/redis")).toBe("./packed/keyv-redis.tgz");
	});

	test("packs a workspace package to that tarball path", () => {
		expect(packArgs("keyv")).toEqual(["--filter", "keyv", "pack", "--out", "./packed/keyv.tgz"]);
	});
});

describe("publishArgs", () => {
	test("builds the exact pnpm stage publish command for a tarball + tag", () => {
		expect(publishArgs("./packed/keyv.tgz", "beta")).toEqual([
			"stage",
			"publish",
			"./packed/keyv.tgz",
			"--tag",
			"beta",
			"--no-git-checks",
			"--access",
			"public",
			"--provenance",
		]);
	});

	test("uses the given tarball and tag", () => {
		expect(`pnpm ${publishArgs("./packed/keyv-redis.tgz", "v5-lts").join(" ")}`).toBe(
			"pnpm stage publish ./packed/keyv-redis.tgz --tag v5-lts --no-git-checks --access public --provenance",
		);
	});

	// Release-blocking guard: the workflow runs these tests before staging,
	// so removing --provenance from publishArgs fails the release. Provenance
	// attestation is required for every package staged from this repo.
	test("always includes --provenance (required for npm provenance attestation)", () => {
		expect(publishArgs("./packed/keyv.tgz", "latest")).toContain("--provenance");
		expect(publishArgs("./packed/keyv-redis.tgz", "beta")).toContain("--provenance");
	});
});
