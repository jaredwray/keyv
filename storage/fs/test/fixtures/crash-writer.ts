// Writes keys one after another and tells the parent process about each write once it resolves.
// The parent kills this process without warning and checks that every acknowledged write is on
// disk.
import KeyvFs from "../../src/index.js";

const [location, strategy] = process.argv.slice(2);
const store = new KeyvFs({ path: location, strategy: strategy as "file" | "directory" });

for (let index = 0; ; index++) {
	await store.set(`key-${index}`, `value-${index}-${"x".repeat(200)}`);
	process.send?.(index);
}
