import fs from "node:fs";
import path from "node:path";
import * as test from "vitest";
import KeyvMysql from "../src/index.js";

const options = {
	ssl: {
		rejectUnauthorized: false,
		ca: fs.readFileSync(path.join(__dirname, "/certs/ca.pem")).toString(),
		key: fs
			.readFileSync(path.join(__dirname, "/certs/client-key.pem"))
			.toString(),
		cert: fs
			.readFileSync(path.join(__dirname, "/certs/client-cert.pem"))
			.toString(),
	},
};

test.beforeEach(async () => {
	const keyv = new KeyvMysql({
		uri: "mysql://root@localhost:3307/keyv_test",
		...options,
	});
	await keyv.clear();
});

test.it("throws if ssl is not used", async (t) => {
	try {
		new KeyvMysql({ uri: "mysql://root@localhost:3307/keyv_test" });
	} catch {
		t.expect(true).toBeTruthy();
	}
});

test.it("set with ssl ", async (t) => {
	const keyv = new KeyvMysql({
		uri: "mysql://root@localhost:3307/keyv_test",
		...options,
	});
	await keyv.set("key", "value");
	t.expect(await keyv.get("key")).toBe("value");
});
