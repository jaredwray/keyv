import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Bench } from "tinybench";

export type TaskData = {
	scenario: string;
	opsPerSecond: number;
	meanTime: number;
	margin: number;
	samples: number;
};

export type AdapterResult = {
	adapter: string;
	files: number;
	bytes: number;
	tasks: TaskData[];
};

export type SizeResult = { size: number; adapters: AdapterResult[] };

export function extractTasks(bench: Bench): TaskData[] {
	const tasks: TaskData[] = [];
	for (const task of bench.tasks) {
		const result = task.result;
		if (result.state !== "completed") {
			continue;
		}

		tasks.push({
			scenario: task.name,
			opsPerSecond: result.throughput.mean,
			meanTime: result.latency.mean,
			margin: result.latency.rme,
			samples: result.latency.samplesCount,
		});
	}

	return tasks;
}

/** Counts the files under a directory and their total size in bytes. */
export function footprint(directory: string): { files: number; bytes: number } {
	let files = 0;
	let bytes = 0;
	for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) {
			files++;
			bytes += statSync(path.join(entry.parentPath, entry.name)).size;
		}
	}

	return { files, bytes };
}

export function argument(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : undefined;
}

function compactNumber(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}

	if (n >= 10_000) {
		return `${Math.round(n / 1_000)}K`;
	}

	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(1)}K`;
	}

	if (n >= 10) {
		return `${Math.round(n)}`;
	}

	return n.toFixed(1);
}

function compactBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	return `${Math.round(bytes / 1024)} KB`;
}

export function environment(): string {
	const cpu = os.cpus()[0]?.model ?? "unknown CPU";
	return `Node.js ${process.version}, ${process.platform} ${process.arch}, ${cpu}`;
}

/**
 * Formats results as one table per store size: a row per scenario, a column per adapter, each
 * cell in operations per second (higher is better).
 */
export function formatMarkdown(results: SizeResult[], env: string): string {
	const lines: string[] = [];
	for (const { size, adapters } of results) {
		const fast = adapters.filter((adapter) => !adapter.tasks.every((task) => task.samples === 0));
		const scenarios = [...new Set(fast.flatMap((adapter) => adapter.tasks.map((t) => t.scenario)))];
		lines.push(`### ${size.toLocaleString("en-US")} entries`, "");
		lines.push(`| Scenario (ops/sec, higher is better) | ${fast.map((a) => a.adapter).join(" | ")} |`);
		lines.push(`| --- | ${fast.map(() => "---:").join(" | ")} |`);
		for (const scenario of scenarios) {
			const cells = fast.map((adapter) => {
				const task = adapter.tasks.find((t) => t.scenario === scenario);
				return task ? compactNumber(task.opsPerSecond) : "—";
			});
			const best = Math.max(
				...fast.map((adapter) => adapter.tasks.find((t) => t.scenario === scenario)?.opsPerSecond ?? 0),
			);
			const marked = cells.map((cell, index) => {
				const task = fast[index].tasks.find((t) => t.scenario === scenario);
				return task && task.opsPerSecond === best ? `**${cell}**` : cell;
			});
			lines.push(`| ${scenario} | ${marked.join(" | ")} |`);
		}

		lines.push(
			`| Disk use | ${fast.map((a) => `${compactBytes(a.bytes)} in ${a.files.toLocaleString("en-US")} file${a.files === 1 ? "" : "s"}`).join(" | ")} |`,
		);
		lines.push("");
	}

	lines.push(`Measured with ${env}.`);
	return lines.join("\n");
}
