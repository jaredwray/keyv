import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	headingAnchors,
	linkTargets,
	listDocsUrls,
	parseFrontmatter,
	parseRedirects,
	publishSkills,
	readSkills,
	type SkillIndex,
	slugify,
	validateSkill,
} from "../src/skills.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillsDirectory = path.join(repoRoot, "skills");
const redirectsFile = path.join(repoRoot, "website", "site", "public", "_redirects");

let temporaryDirectory: string;

beforeEach(async () => {
	temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "keyv-skills-"));
});

afterEach(async () => {
	await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
});

const validSkill = `---
name: sample-skill
description: Does a sample task. Use when testing.
metadata:
  author: tester
---

# Sample

Read [the guide](references/guide.md) and [its setup section](references/guide.md#set-it-up).

| File | URL |
| --- | --- |
| references/guide.md | https://keyv.org/skills/sample-skill/references/guide.md |
`;

const validGuide = `# Guide

## Set it up

Back to [the start](#guide).
`;

async function writeSkill(
	files: Record<string, string>,
	folderName = "sample-skill",
): Promise<string> {
	const skillsRoot = path.join(temporaryDirectory, "skills");
	for (const [file, contents] of Object.entries(files)) {
		const destination = path.join(skillsRoot, folderName, file);
		await fs.promises.mkdir(path.dirname(destination), { recursive: true });
		await fs.promises.writeFile(destination, contents);
	}

	return skillsRoot;
}

async function validate(files: Record<string, string>, folderName?: string): Promise<string[]> {
	const skillsRoot = await writeSkill(files, folderName);
	const [skill] = await readSkills(skillsRoot);
	return validateSkill(skill, new Set(["/docs/migration/v5-to-v6/"]));
}

describe("the skills in this repository", () => {
	test("are all valid", async () => {
		const skills = await readSkills(skillsDirectory);
		expect(skills.map((skill) => skill.name)).toContain("keyv-migrate");
		const docsUrls = await listDocsUrls(repoRoot);
		for (const skill of skills) {
			expect(await validateSkill(skill, docsUrls)).toEqual([]);
		}
	});

	test("keyv-migrate lists SKILL.md first and its references after it", async () => {
		const skills = await readSkills(skillsDirectory);
		const skill = skills.find((item) => item.name === "keyv-migrate");
		expect(skill?.files[0]).toBe("SKILL.md");
		expect(skill?.files).toContain("references/stored-data.md");
	});
});

describe("validateSkill", () => {
	test("accepts a valid skill", async () => {
		expect(await validate({ "SKILL.md": validSkill, "references/guide.md": validGuide })).toEqual(
			[],
		);
	});

	test("requires frontmatter", async () => {
		const errors = await validate({ "SKILL.md": "# No frontmatter\n" });
		expect(errors).toEqual(["skills/sample-skill/SKILL.md: missing YAML frontmatter"]);
	});

	test("requires the name to match the folder", async () => {
		const errors = await validate(
			{ "SKILL.md": validSkill.replace("sample-skill\n", "other-skill\n") },
			"sample-skill",
		);
		expect(errors.join("\n")).toContain('name "other-skill" must match its folder name');
	});

	test("rejects names that break the spec", async () => {
		for (const name of ["Sample", "-sample", "sample-", "sam--ple", "a".repeat(65)]) {
			const errors = await validate({
				"SKILL.md": validSkill.replace("sample-skill\n", `${name}\n`),
			});
			expect(errors.join("\n")).toContain("name must be 1-64 lowercase letters");
		}
	});

	test("limits the description to 1024 characters", async () => {
		const errors = await validate({
			"SKILL.md": validSkill.replace("Does a sample task. Use when testing.", "x".repeat(1025)),
			"references/guide.md": validGuide,
		});
		expect(errors).toContain("skills/sample-skill/SKILL.md: description must be 1-1024 characters");
	});

	test("treats metadata as optional", async () => {
		const errors = await validate({
			"SKILL.md": validSkill.replace("metadata:\n  author: tester\n", ""),
			"references/guide.md": validGuide,
		});
		expect(errors).toEqual([]);
	});

	test("requires metadata values to be strings", async () => {
		const errors = await validate({
			"SKILL.md": validSkill.replace("author: tester", "version: 1"),
			"references/guide.md": validGuide,
		});
		expect(errors).toContain("skills/sample-skill/SKILL.md: metadata must map strings to strings");
	});

	test("keeps SKILL.md under 500 lines", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}${"\nline".repeat(500)}`,
			"references/guide.md": validGuide,
		});
		expect(errors.join("\n")).toContain("keep it under 500");
	});

	test("reports files that SKILL.md doesn't link to", async () => {
		const errors = await validate({
			"SKILL.md": validSkill,
			"references/guide.md": validGuide,
			"references/orphan.md": "# Orphan\n",
		});
		expect(errors).toContain("skills/sample-skill/references/orphan.md: not linked from SKILL.md");
		expect(errors.join("\n")).toContain("list the absolute URL of references/orphan.md");
	});

	test("reports broken links and missing headings", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}\nSee [missing](references/missing.md) and [bad anchor](references/guide.md#nope).\n`,
			"references/guide.md": validGuide,
		});
		expect(errors).toContain(
			"skills/sample-skill/SKILL.md: link references/missing.md does not point to a file in this skill",
		);
		expect(errors).toContain(
			"skills/sample-skill/SKILL.md: link references/guide.md#nope points to a missing heading",
		);
	});

	test("checks keyv.org links against skill files and docs pages", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}\nSee https://keyv.org/skills/sample-skill/references/gone.md and https://keyv.org/docs/nope/.\nAlso https://keyv.org/docs/migration/v5-to-v6/.\n`,
			"references/guide.md": validGuide,
		});
		expect(errors).toContain(
			"skills/sample-skill/SKILL.md: https://keyv.org/skills/sample-skill/references/gone.md is not a file in this skill",
		);
		expect(errors).toContain(
			"skills/sample-skill/SKILL.md: https://keyv.org/docs/nope/ is not a keyv.org docs page",
		);
		expect(errors.join("\n")).not.toContain("v5-to-v6");
	});

	test("keeps skills Markdown only", async () => {
		const errors = await validate({
			"SKILL.md": validSkill,
			"references/guide.md": validGuide,
			"scripts/run.sh": "echo hi\n",
		});
		expect(errors).toContain(
			"skills/sample-skill/scripts/run.sh: skills are Markdown only; don't add scripts or other files",
		);
	});

	test("ignores links inside code", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}\n\`[x](missing.md)\`\n\n\`\`\`md\n[y](also-missing.md)\n\`\`\`\n`,
			"references/guide.md": validGuide,
		});
		expect(errors).toEqual([]);
	});

	test("matches keyv.org by exact origin, not by prefix", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}\nSee [one](https://keyv.org.example.com/docs/nope/), [two](https://keyv.org@example.com/docs/nope/), and [three](https://KEYV.org/docs/nope/).\n`,
			"references/guide.md": validGuide,
		});
		expect(errors).toEqual([
			"skills/sample-skill/SKILL.md: https://KEYV.org/docs/nope/ is not a keyv.org docs page",
		]);
	});

	test("doesn't check links to other sites", async () => {
		const errors = await validate({
			"SKILL.md": `${validSkill}\nSee [the spec](https://agentskills.io/specification) and [mail](mailto:a@b.c).\n`,
			"references/guide.md": validGuide,
		});
		expect(errors).toEqual([]);
	});

	test("limits compatibility to 500 characters", async () => {
		const errors = await validate({
			"SKILL.md": validSkill.replace("metadata:", `compatibility: ${"x".repeat(501)}\nmetadata:`),
			"references/guide.md": validGuide,
		});
		expect(errors).toContain(
			"skills/sample-skill/SKILL.md: compatibility must be at most 500 characters",
		);
	});

	test("keeps files at most one folder deep", async () => {
		const errors = await validate({
			"SKILL.md": validSkill,
			"references/guide.md": validGuide,
			"references/deep/more.md": "# More\n",
		});
		expect(errors).toContain(
			"skills/sample-skill/references/deep/more.md: keep files at most one folder deep",
		);
	});
});

describe("readSkills", () => {
	test("reads skill folders in name order and skips folders without SKILL.md", async () => {
		await writeSkill({ "SKILL.md": validSkill.replace("sample-skill\n", "b-skill\n") }, "b-skill");
		await writeSkill({ "SKILL.md": validSkill.replace("sample-skill\n", "a-skill\n") }, "a-skill");
		const skillsRoot = await writeSkill({ "notes.md": "# Not a skill\n" }, "not-a-skill");
		await fs.promises.writeFile(path.join(skillsRoot, "README.md"), "# Skills\n");

		const skills = await readSkills(skillsRoot);
		expect(skills.map((skill) => skill.name)).toEqual(["a-skill", "b-skill"]);
	});
});

describe("publishSkills", () => {
	test("copies each skill to both URLs and writes the discovery index", async () => {
		const publicDirectory = path.join(temporaryDirectory, "public");
		const skills = await publishSkills({ skillsDirectory, publicDirectory });
		const index = JSON.parse(
			await fs.promises.readFile(
				path.join(publicDirectory, ".well-known", "skills", "index.json"),
				"utf8",
			),
		) as SkillIndex;

		expect(index.skills.map((entry) => entry.name)).toEqual(skills.map((skill) => skill.name));
		for (const entry of index.skills) {
			const skill = skills.find((item) => item.name === entry.name);
			expect(entry.description).toBe(skill?.description);
			expect(entry.files[0]).toBe("SKILL.md");
			for (const file of entry.files) {
				expect(file.startsWith("/") || file.includes("..")).toBe(false);
				const source = await fs.promises.readFile(path.join(skill?.directory ?? "", file), "utf8");
				for (const base of ["skills", path.join(".well-known", "skills")]) {
					const published = path.join(publicDirectory, base, entry.name, file);
					expect(await fs.promises.readFile(published, "utf8")).toBe(source);
				}
			}
		}
	});

	test("removes files left over from an earlier build", async () => {
		const publicDirectory = path.join(temporaryDirectory, "public");
		const stale = [
			path.join(publicDirectory, "skills", "old-skill", "SKILL.md"),
			path.join(publicDirectory, ".well-known", "skills", "old-skill", "SKILL.md"),
		];
		for (const file of stale) {
			await fs.promises.mkdir(path.dirname(file), { recursive: true });
			await fs.promises.writeFile(file, "stale");
		}

		const keep = path.join(publicDirectory, ".well-known", "security.txt");
		await fs.promises.writeFile(keep, "keep");

		await publishSkills({ skillsDirectory, publicDirectory });
		for (const file of stale) {
			expect(fs.existsSync(file)).toBe(false);
		}

		expect(fs.existsSync(keep)).toBe(true);
	});

	test("fails when a skill is invalid", async () => {
		const skillsRoot = await writeSkill({ "SKILL.md": "# No frontmatter\n" });
		await expect(
			publishSkills({ skillsDirectory: skillsRoot, publicDirectory: temporaryDirectory }),
		).rejects.toThrow("Invalid agent skills");
	});
});

describe("keyv.org redirects", () => {
	test("the short URL returns the migration skill", async () => {
		const rules = parseRedirects(await fs.promises.readFile(redirectsFile, "utf8"));
		expect(rules).toContainEqual(
			expect.objectContaining({
				from: "/skills/migrate",
				to: "/skills/keyv-migrate/SKILL.md",
				status: 200,
			}),
		);
	});

	test("every /skills rule points to a published file", async () => {
		const publicDirectory = path.join(temporaryDirectory, "public");
		await publishSkills({ skillsDirectory, publicDirectory });
		const rules = parseRedirects(await fs.promises.readFile(redirectsFile, "utf8"));
		const skillRules = rules.filter((rule) => rule.from.startsWith("/skills/"));
		expect(skillRules.length).toBeGreaterThan(0);

		for (const rule of skillRules) {
			const target = path.join(publicDirectory, rule.to.replace(":splat", ""));
			expect(fs.existsSync(target), `${rule.to} (line ${rule.line})`).toBe(true);
		}
	});

	test("static /skills rules come before the first splat rule", async () => {
		const rules = parseRedirects(await fs.promises.readFile(redirectsFile, "utf8"));
		const firstSplat = rules.findIndex((rule) => rule.from.includes("*"));
		for (const [index, rule] of rules.entries()) {
			if (rule.from.startsWith("/skills/") && !rule.from.includes("*")) {
				expect(index, `line ${rule.line}`).toBeLessThan(firstSplat);
			}
		}
	});
});

describe("helpers", () => {
	test("parseFrontmatter splits YAML from the body", () => {
		expect(parseFrontmatter("---\nname: a\n---\n# Body\n")).toEqual({
			data: { name: "a" },
			body: "# Body\n",
		});
		expect(parseFrontmatter("# No frontmatter")).toBeUndefined();
		expect(parseFrontmatter("---\n- a list\n---\n")).toBeUndefined();
	});

	test("slugify matches GitHub heading anchors", () => {
		expect(slugify("`@keyv/redis` moved to the official Redis client")).toBe(
			"keyvredis-moved-to-the-official-redis-client",
		);
		expect(slugify("SQLite (`@keyv/sqlite`)")).toBe("sqlite-keyvsqlite");
		expect(slugify("clear() without a namespace")).toBe("clear-without-a-namespace");
	});

	test("headingAnchors skips headings inside code blocks", () => {
		expect(headingAnchors("# Real\n```sh\n# comment\n```\n## Also real\n")).toEqual(
			new Set(["real", "also-real"]),
		);
	});

	test("linkTargets finds Markdown links and bare keyv.org URLs", () => {
		expect(
			linkTargets("See [a](a.md), https://keyv.org/docs/x/. and `[b](b.md)`.\n```\n[c](c.md)\n```"),
		).toEqual(["a.md", "https://keyv.org/docs/x/"]);
	});

	test("parseRedirects reads rules and defaults to 302", () => {
		expect(parseRedirects("# comment\n/a /b 301\n\n/c /d\n")).toEqual([
			{ from: "/a", to: "/b", status: 301, line: 2 },
			{ from: "/c", to: "/d", status: 302, line: 4 },
		]);
	});

	test("listDocsUrls includes written and generated pages", async () => {
		const urls = await listDocsUrls(repoRoot);
		expect(urls).toContain("/docs/migration/v5-to-v6/");
		expect(urls).toContain("/docs/migration/ai-agent-skill/");
		expect(urls).toContain("/docs/storage-adapters/redis/");
		expect(urls).toContain("/docs/compression/compress-gzip/");
		expect(urls).toContain("/docs/test-suite/");
	});
});
