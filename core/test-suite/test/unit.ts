import Keyv from "keyv";
import * as test from "vitest";
import { KeyvLz4TestAdapter } from "../src/compression-adapter.js";
import keyvTestSuite, {
	keyvCompressionTests,
	keyvIteratorTests,
} from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {
		// biome-ignore lint/suspicious/noExplicitAny: type format for Map
		constructor(map: Map<any, any>) {
			// @ts-expect-error - super don't accept arguments
			super(map);
		}
	}

	return new MapExtend(new Map());
};

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
keyvCompressionTests(test, new KeyvLz4TestAdapter());
