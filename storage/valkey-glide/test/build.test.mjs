import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { Keyv } from "keyv";
import { createKeyv } from "../dist/index.mjs";

test("ESM createKeyv uses the application's Keyv peer", async () => {
	const instance = createKeyv();
	try {
		assert.ok(instance instanceof Keyv);
	} finally {
		await instance.disconnect();
	}
});

test("CommonJS createKeyv uses the application's Keyv peer", async () => {
	const require = createRequire(import.meta.url);
	const { Keyv: CommonJsKeyv } = require("keyv");
	const { createKeyv: createCommonJsKeyv } = require("../dist/index.cjs");
	const instance = createCommonJsKeyv();
	try {
		assert.ok(instance instanceof CommonJsKeyv);
	} finally {
		await instance.disconnect();
	}
});
