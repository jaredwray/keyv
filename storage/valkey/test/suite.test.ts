import process from "node:process";
import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import Keyv from "keyv";
import { afterAll, it } from "vitest";
import KeyvValkey from "../src/index.js";

const valkeyUri = process.env.VALKEY_URI ?? "redis://localhost:6370";

const store = () => new KeyvValkey(valkeyUri);

afterAll(async () => {
	const keyv = store();
	await keyv.clear();
	await keyv.disconnect();
});

// The shared suite registers tests via the provided function; vitest's `it` is required here.
keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store);
