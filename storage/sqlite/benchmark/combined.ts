import { formatCombinedMarkdown, runBenchmarks } from "./utils.js";

const allResults = runBenchmarks();

if (allResults.length > 0) {
	console.log("");
	console.log(formatCombinedMarkdown(allResults));
	console.log("");
} else {
	console.error("No benchmark results collected.");
	process.exit(1);
}
