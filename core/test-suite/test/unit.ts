import Keyv from "keyv";
import * as test from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import keyvTestSuite, { keyvCompressionTests, keyvIteratorTests } from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {}

	return new MapExtend();
};

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
keyvCompressionTests(test, new KeyvLz4TestAdapter());
