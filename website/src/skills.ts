import fs from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

/**
 * Agent Skills live in the repo's root `skills/` folder, one folder per skill. They are published
 * on keyv.org in two places:
 * - `/skills/<name>/...`, the stable URL that docs and the `/skills/migrate` alias point to.
 * - `/.well-known/skills/<name>/...` plus `/.well-known/skills/index.json`, the discovery index
 *   (Agent Skills Discovery v0.1) that `npx skills add https://keyv.org` reads.
 * The v0.2 `/.well-known/agent-skills/` index is not published on purpose: the `skills` CLI checks
 * it first, and its `skill-md` entries would install SKILL.md without the reference files.
 */

export const siteUrl = "https://keyv.org";

export type Skill = {
	/** The skill's `name` from its frontmatter. */
	name: string;
	/** The skill's `description` from its frontmatter. */
	description: string;
	/** Absolute path to the skill's folder. */
	directory: string;
	/** Name of the skill's folder. */
	folderName: string;
	/** Every file in the skill, relative to its folder, with `/` separators. SKILL.md comes first. */
	files: string[];
	/** Parsed YAML frontmatter of SKILL.md. */
	frontmatter: Record<string, unknown>;
};

export type SkillIndex = {
	skills: Array<{ name: string; description: string; files: string[] }>;
};

export type RedirectRule = {
	from: string;
	to: string;
	status: number;
	line: number;
};

const skillNamePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const maxSkillLines = 500;

/**
 * Splits a Markdown file into its YAML frontmatter and body.
 * @param {string} text - The file contents.
 * @returns {{ data: Record<string, unknown>; body: string } | undefined} The parsed frontmatter and body, or undefined when there is no frontmatter.
 */
export function parseFrontmatter(
	text: string,
): { data: Record<string, unknown>; body: string } | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
	if (!match) {
		return undefined;
	}

	const data = load(match[1]);
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return undefined;
	}

	return { data: data as Record<string, unknown>, body: text.slice(match[0].length) };
}

/**
 * Lists every file below a folder, relative to it, with `/` separators, sorted.
 * @param {string} directory - The folder to list.
 * @returns {Promise<string[]>} The relative file paths.
 */
export async function listFiles(directory: string): Promise<string[]> {
	const entries = await fs.promises.readdir(directory, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
		)
		.sort();
}

/**
 * Reads every skill in a folder. A skill is a subfolder that contains SKILL.md.
 * @param {string} skillsDirectory - The folder that holds the skills, such as the repo's `skills/`.
 * @returns {Promise<Skill[]>} The skills, sorted by folder name.
 */
export async function readSkills(skillsDirectory: string): Promise<Skill[]> {
	const entries = await fs.promises.readdir(skillsDirectory, { withFileTypes: true });
	const skills: Skill[] = [];

	for (const entry of entries.filter((item) => item.isDirectory()).sort(byName)) {
		const directory = path.join(skillsDirectory, entry.name);
		const skillFile = path.join(directory, "SKILL.md");
		if (!fs.existsSync(skillFile)) {
			continue;
		}

		const parsed = parseFrontmatter(await fs.promises.readFile(skillFile, "utf8"));
		const frontmatter = parsed?.data ?? {};
		const files = await listFiles(directory);
		skills.push({
			name: typeof frontmatter.name === "string" ? frontmatter.name : "",
			description: typeof frontmatter.description === "string" ? frontmatter.description : "",
			directory,
			folderName: entry.name,
			files: ["SKILL.md", ...files.filter((file) => file !== "SKILL.md")],
			frontmatter,
		});
	}

	return skills;
}

/**
 * Turns a Markdown heading into the anchor GitHub and most renderers give it.
 * @param {string} heading - The heading text, without the leading `#` characters.
 * @returns {string} The anchor, without `#`.
 */
export function slugify(heading: string): string {
	return heading
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
		.replace(/ /g, "-");
}

/**
 * Collects the anchors of every heading in a Markdown file, skipping fenced code blocks.
 * @param {string} markdown - The Markdown text.
 * @returns {Set<string>} The anchors.
 */
export function headingAnchors(markdown: string): Set<string> {
	const anchors = new Set<string>();
	for (const line of stripCodeBlocks(markdown).split("\n")) {
		const match = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
		if (match) {
			anchors.add(slugify(match[1]));
		}
	}

	return anchors;
}

/**
 * Finds the targets of Markdown links, skipping fenced code blocks and inline code.
 * @param {string} markdown - The Markdown text.
 * @returns {string[]} The link targets.
 */
export function linkTargets(markdown: string): string[] {
	const text = stripCodeBlocks(markdown).replace(/`[^`\n]*`/g, "");
	const targets: string[] = [];
	for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
		targets.push(match[1]);
	}

	for (const match of text.matchAll(/(?<![(\w])(https:\/\/keyv\.org\/[^\s)|>]+)/g)) {
		targets.push(match[1].replace(/[.,;:]+$/, ""));
	}

	return targets;
}

/**
 * Lists the page URLs that the website serves under `/docs/`, from committed docs pages and from
 * the package folders whose READMEs `website/src/docs.ts` turns into pages at build time.
 * @param {string} basePath - The repo root.
 * @returns {Promise<Set<string>>} Paths such as `/docs/migration/v5-to-v6/`.
 */
export async function listDocsUrls(basePath: string): Promise<Set<string>> {
	const urls = new Set<string>(["/docs/", "/docs/test-suite/"]);
	const docsDirectory = path.join(basePath, "website", "site", "docs");
	for (const file of await listFiles(docsDirectory)) {
		if (file.endsWith(".md") && file !== "index.md") {
			urls.add(`/docs/${file.slice(0, -".md".length)}/`);
		}
	}

	const generated: Array<[string, string]> = [
		["storage", "storage-adapters"],
		["compression", "compression"],
		["serialization", "serialization"],
		["encryption", "encryption"],
	];
	for (const [packageFolder, section] of generated) {
		const entries = await fs.promises.readdir(path.join(basePath, packageFolder), {
			withFileTypes: true,
		});
		for (const entry of entries.filter((item) => item.isDirectory())) {
			urls.add(`/docs/${section}/${entry.name}/`);
		}
	}

	urls.add("/docs/storage-adapters/bigmap/");
	return urls;
}

/**
 * Checks a skill against the Agent Skills specification and this repo's rules.
 * @param {Skill} skill - The skill to check.
 * @param {Set<string>} [docsUrls] - Pages that `https://keyv.org/docs/...` links may point to. Skips the check when omitted.
 * @returns {Promise<string[]>} One message per problem. Empty when the skill is valid.
 */
export async function validateSkill(skill: Skill, docsUrls?: Set<string>): Promise<string[]> {
	const errors: string[] = [];
	const where = `skills/${skill.folderName}`;
	const skillText = await fs.promises.readFile(path.join(skill.directory, "SKILL.md"), "utf8");
	const parsed = parseFrontmatter(skillText);
	if (!parsed) {
		return [`${where}/SKILL.md: missing YAML frontmatter`];
	}

	const { data } = parsed;
	if (typeof data.name !== "string" || data.name.length > 64 || !skillNamePattern.test(data.name)) {
		errors.push(
			`${where}/SKILL.md: name must be 1-64 lowercase letters, digits, and single hyphens`,
		);
	} else if (data.name !== skill.folderName) {
		errors.push(`${where}/SKILL.md: name "${data.name}" must match its folder name`);
	}

	if (
		typeof data.description !== "string" ||
		data.description.trim().length === 0 ||
		data.description.length > 1024
	) {
		errors.push(`${where}/SKILL.md: description must be 1-1024 characters`);
	}

	if (
		data.compatibility !== undefined &&
		(typeof data.compatibility !== "string" || data.compatibility.length > 500)
	) {
		errors.push(`${where}/SKILL.md: compatibility must be at most 500 characters`);
	}

	if (data.metadata !== undefined) {
		const metadata = data.metadata;
		const valid =
			typeof metadata === "object" &&
			metadata !== null &&
			!Array.isArray(metadata) &&
			Object.values(metadata).every((value) => typeof value === "string");
		if (!valid) {
			errors.push(`${where}/SKILL.md: metadata must map strings to strings`);
		}
	}

	const lineCount = skillText.split("\n").length;
	if (lineCount > maxSkillLines) {
		errors.push(`${where}/SKILL.md: ${lineCount} lines; keep it under ${maxSkillLines}`);
	}

	for (const file of skill.files) {
		if (!file.endsWith(".md")) {
			errors.push(`${where}/${file}: skills are Markdown only; don't add scripts or other files`);
		}

		if (file.split("/").length > 2) {
			errors.push(`${where}/${file}: keep files at most one folder deep`);
		}
	}

	const linkedFromSkill = new Set<string>();
	for (const file of skill.files.filter((item) => item.endsWith(".md"))) {
		const text = await fs.promises.readFile(path.join(skill.directory, file), "utf8");
		for (const target of linkTargets(text)) {
			const problem = await checkLink(skill, file, target, docsUrls, linkedFromSkill);
			if (problem) {
				errors.push(`${where}/${file}: ${problem}`);
			}
		}
	}

	for (const file of skill.files.filter((item) => item !== "SKILL.md")) {
		if (!linkedFromSkill.has(file)) {
			errors.push(`${where}/${file}: not linked from SKILL.md`);
		}

		if (!skillText.includes(`${siteUrl}/skills/${skill.folderName}/${file}`)) {
			errors.push(
				`${where}/SKILL.md: list the absolute URL of ${file} for agents that read the skill from keyv.org`,
			);
		}
	}

	return errors;
}

/**
 * Copies every skill into the website's public folder and writes the discovery index. Throws when
 * a skill is invalid, so a broken skill fails the website build.
 * @param {object} options - Where to read and write.
 * @param {string} options.skillsDirectory - The folder that holds the skills.
 * @param {string} options.publicDirectory - The website's `site/public` folder.
 * @param {Set<string>} [options.docsUrls] - Pages that `https://keyv.org/docs/...` links may point to.
 * @returns {Promise<Skill[]>} The published skills.
 */
export async function publishSkills(options: {
	skillsDirectory: string;
	publicDirectory: string;
	docsUrls?: Set<string>;
}): Promise<Skill[]> {
	const skills = await readSkills(options.skillsDirectory);
	const errors: string[] = [];
	for (const skill of skills) {
		errors.push(...(await validateSkill(skill, options.docsUrls)));
	}

	if (errors.length > 0) {
		throw new Error(`Invalid agent skills:\n${errors.join("\n")}`);
	}

	// Generated output survives `docula build --clean`, so remove it first to drop stale files.
	const skillsOutput = path.join(options.publicDirectory, "skills");
	const wellKnownOutput = path.join(options.publicDirectory, ".well-known", "skills");
	await fs.promises.rm(skillsOutput, { recursive: true, force: true });
	await fs.promises.rm(wellKnownOutput, { recursive: true, force: true });

	const index: SkillIndex = { skills: [] };
	for (const skill of skills) {
		for (const file of skill.files) {
			for (const output of [skillsOutput, wellKnownOutput]) {
				const destination = path.join(output, skill.name, file);
				await fs.promises.mkdir(path.dirname(destination), { recursive: true });
				await fs.promises.copyFile(path.join(skill.directory, file), destination);
			}
		}

		index.skills.push({ name: skill.name, description: skill.description, files: skill.files });
	}

	await fs.promises.mkdir(wellKnownOutput, { recursive: true });
	await fs.promises.writeFile(
		path.join(wellKnownOutput, "index.json"),
		`${JSON.stringify(index, null, 2)}\n`,
	);

	return skills;
}

/**
 * Parses a Cloudflare Pages `_redirects` file.
 * @param {string} text - The file contents.
 * @returns {RedirectRule[]} The rules, in file order.
 */
export function parseRedirects(text: string): RedirectRule[] {
	const rules: RedirectRule[] = [];
	for (const [index, rawLine] of text.split("\n").entries()) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) {
			continue;
		}

		const [from, to, status] = line.split(/\s+/);
		rules.push({ from, to, status: status ? Number(status) : 302, line: index + 1 });
	}

	return rules;
}

async function checkLink(
	skill: Skill,
	file: string,
	target: string,
	docsUrls: Set<string> | undefined,
	linkedFromSkill: Set<string>,
): Promise<string | undefined> {
	if (target.startsWith(siteUrl)) {
		const url = new URL(target);
		const skillPrefix = `/skills/${skill.folderName}/`;
		if (url.pathname.startsWith(skillPrefix)) {
			const skillFile = url.pathname.slice(skillPrefix.length);
			return skill.files.includes(skillFile) ? undefined : `${target} is not a file in this skill`;
		}

		if (url.pathname.startsWith("/docs/") && docsUrls && !docsUrls.has(url.pathname)) {
			return `${target} is not a keyv.org docs page`;
		}

		return undefined;
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
		return undefined;
	}

	const [relativePath, anchor] = target.split("#");
	const resolved = relativePath
		? path.posix.normalize(path.posix.join(path.posix.dirname(file), relativePath))
		: file;
	if (resolved.startsWith("../") || !skill.files.includes(resolved)) {
		return `link ${target} does not point to a file in this skill`;
	}

	if (file === "SKILL.md") {
		linkedFromSkill.add(resolved);
	}

	if (anchor) {
		const text = await fs.promises.readFile(path.join(skill.directory, resolved), "utf8");
		if (!headingAnchors(text).has(anchor)) {
			return `link ${target} points to a missing heading`;
		}
	}

	return undefined;
}

function stripCodeBlocks(markdown: string): string {
	return markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
}

function byName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name);
}
