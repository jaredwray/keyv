import { keyvApiTests, keyvValueTests } from "@keyv/test-suite";
import Keyv, { type KeyvOptions } from "keyv";
import { describe, it } from "vitest";
import KeyvFs from "../src/index.js";
import { freshLocation, strategies } from "./helpers.js";

/** Keyv with serialization off unless a test sets its own serializer. */
class RawKeyv extends Keyv {
	constructor(options?: KeyvOptions) {
		super({ serialization: false, ...options });
	}
}

describe.each(strategies)("%s strategy with serialization off", (strategy) => {
	const location = freshLocation(strategy);
	const store = () => new KeyvFs({ path: location, strategy });
	keyvApiTests(it, RawKeyv as typeof Keyv, store);
	keyvValueTests(it, RawKeyv as typeof Keyv, store);
});
