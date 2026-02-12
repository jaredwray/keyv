import Keyv from "keyv";
import * as test from "vitest";
import { CompressionAdapter } from "../src/compression-adapter.js";
import keyvTestSuite, {
	keyvCompresstionTests,
	keyvIteratorTests,
} from "../src/index.js";

const storeExtended = () => {
	class MapExtend extends Map {
		// biome-ignore lint/correctness/noUnusedPrivateClassMembers: allowed
		private readonly opts: { timeout: number };
		// biome-ignore lint/suspicious/noExplicitAny: type format for Map
		constructor(map: Map<any, any>, options: { timeout: number }) {
			// @ts-expect-error - super don't accept arguments
			super(map);
			this.opts = options;
		}
	}

	return new MapExtend(new Map(), { timeout: 1000 });
};

keyvTestSuite(test, Keyv, storeExtended);
keyvIteratorTests(test, Keyv, storeExtended);
// @ts-expect-error - compression
keyvCompresstionTests(test, new CompressionAdapter());
