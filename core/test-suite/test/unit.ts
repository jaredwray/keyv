import Keyv from "keyv";
import { it } from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import keyvTestSuite, { keyvCompressionTests, keyvIteratorTests } from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {}

	return new MapExtend();
};

keyvTestSuite(it, Keyv, storeExtended);
keyvIteratorTests(it, Keyv, storeExtended);
keyvCompressionTests(it, new KeyvLz4TestAdapter());
