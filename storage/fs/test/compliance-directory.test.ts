import path from "node:path";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { describe, it } from "vitest";
import KeyvFs from "../src/index.js";
import { tempDir } from "./helpers.js";

describe("directory strategy compliance", () => {
	const directory = path.join(tempDir(), "store");
	const store = () => new KeyvFs({ path: directory, strategy: "directory" });
	keyvTestSuite(it, Keyv, store);
	keyvIteratorTests(it, Keyv, store);
	storageTestSuite(it, store);
});
