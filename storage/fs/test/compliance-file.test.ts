import path from "node:path";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { describe, it } from "vitest";
import KeyvFs from "../src/index.js";
import { tempDir } from "./helpers.js";

describe("file strategy compliance", () => {
	const file = path.join(tempDir(), "store.jsonl");
	const store = () => new KeyvFs({ path: file });
	keyvTestSuite(it, Keyv, store);
	keyvIteratorTests(it, Keyv, store);
	storageTestSuite(it, store);
});
