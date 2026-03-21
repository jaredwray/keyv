import { writeFileSync } from "node:fs";
import { tinybenchPrinter } from "@monstermann/tinybench-pretty-printer";
import type { Bench } from "tinybench";

export interface TaskData {
	name: string;
	opsPerSecond: number;
	meanTime: number;
	margin: number;
	samples: number;
}

export interface BenchmarkResult {
	benchName: string;
	tasks: TaskData[];
}

export function extractResults(bench: Bench): BenchmarkResult {
	const tasks: TaskData[] = [];
	for (const task of bench.tasks) {
		const result = task.result;
		if (result.state !== "completed") {
			continue;
		}

		tasks.push({
			name: task.name,
			opsPerSecond: result.throughput.mean,
			meanTime: result.latency.mean,
			margin: result.latency.rme,
			samples: result.latency.samplesCount,
		});
	}

	return { benchName: bench.name ?? "benchmark", tasks };
}

export function parseOutputFlag(): string | undefined {
	const args = process.argv;
	const index = args.indexOf("--output");
	if (index !== -1 && index + 1 < args.length) {
		return args[index + 1];
	}

	return undefined;
}

export function handleOutput(bench: Bench): void {
	const outputPath = parseOutputFlag();
	if (outputPath) {
		const results = extractResults(bench);
		writeFileSync(outputPath, JSON.stringify(results, null, 2));
	} else {
		console.log(tinybenchPrinter.toMarkdown(bench));
		console.log("");
	}
}

function compactNumber(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}

	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(0)}K`;
	}

	return `${Math.round(n)}`;
}

function compactTime(ms: number): string {
	if (ms < 0.001) {
		return `${Math.round(ms * 1_000_000)}ns`;
	}

	if (ms < 1) {
		return `${Math.round(ms * 1_000)}µs`;
	}

	return `${Math.round(ms)}ms`;
}

function pad(str: string, width: number, align: "left" | "center" | "right" = "left"): string {
	if (str.length >= width) {
		return str;
	}

	const diff = width - str.length;
	if (align === "right") {
		return " ".repeat(diff) + str;
	}

	if (align === "center") {
		const left = Math.floor(diff / 2);
		return " ".repeat(left) + str + " ".repeat(diff - left);
	}

	return str + " ".repeat(diff);
}

export function formatCombinedMarkdown(results: BenchmarkResult[]): string {
	const allTasks: TaskData[] = results.flatMap((r) => r.tasks);

	if (allTasks.length === 0) {
		return "No benchmark results to display.";
	}

	allTasks.sort((a, b) => b.opsPerSecond - a.opsPerSecond);

	const fastest = allTasks[0];

	const data = allTasks.map((task) => {
		const summary = task === fastest
			? "🥇"
			: `${(((task.opsPerSecond - fastest.opsPerSecond) / fastest.opsPerSecond) * 100).toFixed(1)}%`;

		return {
			name: task.name,
			summary,
			ops: compactNumber(task.opsPerSecond),
			time: compactTime(task.meanTime),
			margin: `±${task.margin.toFixed(2)}%`,
			samples: compactNumber(task.samples),
		};
	});

	const headers = { name: "name", summary: "summary", ops: "ops/sec", time: "time/op", margin: "margin", samples: "samples" };

	const cols = {
		name: Math.max(headers.name.length, ...data.map((d) => d.name.length)) + 2,
		summary: Math.max(headers.summary.length, ...data.map((d) => d.summary.length)) + 2,
		ops: Math.max(headers.ops.length, ...data.map((d) => d.ops.length)) + 2,
		time: Math.max(headers.time.length, ...data.map((d) => d.time.length)) + 2,
		margin: Math.max(headers.margin.length, ...data.map((d) => d.margin.length)) + 2,
		samples: Math.max(headers.samples.length, ...data.map((d) => d.samples.length)) + 2,
	};

	const headerRow = `| ${pad(headers.name, cols.name)} | ${pad(headers.summary, cols.summary, "center")} | ${pad(headers.ops, cols.ops, "right")} | ${pad(headers.time, cols.time, "right")} | ${pad(headers.margin, cols.margin, "center")} | ${pad(headers.samples, cols.samples, "right")} |`;
	const separator = `|${"-".repeat(cols.name + 2)}|:${"-".repeat(cols.summary)}:|${"-".repeat(cols.ops + 1)}:|${"-".repeat(cols.time + 1)}:|:${"-".repeat(cols.margin)}:|${"-".repeat(cols.samples + 1)}:|`;

	const rows = data.map((d) =>
		`| ${pad(d.name, cols.name)} | ${pad(d.summary, cols.summary, "center")} | ${pad(d.ops, cols.ops, "right")} | ${pad(d.time, cols.time, "right")} | ${pad(d.margin, cols.margin, "center")} | ${pad(d.samples, cols.samples, "right")} |`,
	);

	return [headerRow, separator, ...rows].join("\n");
}
