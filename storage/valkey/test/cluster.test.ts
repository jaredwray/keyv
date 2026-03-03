import Redis, { type Cluster } from "iovalkey";
import * as test from "vitest";
import KeyvValkey from "../src/index.js";

const clusterNodes = [
	{ host: "127.0.0.1", port: 7001 },
	{ host: "127.0.0.1", port: 7002 },
	{ host: "127.0.0.1", port: 7003 },
];

test.it("cluster: setMany should work without CROSSSLOT errors", async (t) => {
	const cluster = new Redis.Cluster(clusterNodes);
	const keyv = new KeyvValkey(cluster as Cluster);

	await keyv.setMany([
		{ key: "cl-sm1", value: "val1" },
		{ key: "cl-sm2", value: "val2" },
		{ key: "cl-sm3", value: "val3" },
		{ key: "cl-sm4", value: "val4" },
	]);

	t.expect(await keyv.get("cl-sm1")).toBe("val1");
	t.expect(await keyv.get("cl-sm2")).toBe("val2");
	t.expect(await keyv.get("cl-sm3")).toBe("val3");
	t.expect(await keyv.get("cl-sm4")).toBe("val4");

	await keyv.disconnect();
});

test.it("cluster: getMany should work without CROSSSLOT errors", async (t) => {
	const cluster = new Redis.Cluster(clusterNodes);
	const keyv = new KeyvValkey(cluster as Cluster);

	await keyv.set("cl-gm1", "val1");
	await keyv.set("cl-gm2", "val2");
	await keyv.set("cl-gm3", "val3");

	const values = await keyv.getMany(["cl-gm1", "cl-gm2", "cl-gm3"]);
	t.expect(values).toEqual(["val1", "val2", "val3"]);

	await keyv.disconnect();
});

test.it(
	"cluster: deleteMany should work without CROSSSLOT errors",
	async (t) => {
		const cluster = new Redis.Cluster(clusterNodes);
		const keyv = new KeyvValkey(cluster as Cluster);

		await keyv.set("cl-dm1", "val1");
		await keyv.set("cl-dm2", "val2");
		await keyv.set("cl-dm3", "val3");

		const result = await keyv.deleteMany(["cl-dm1", "cl-dm2", "cl-dm3"]);
		t.expect(result).toBe(true);
		t.expect(await keyv.get("cl-dm1")).toBe(undefined);
		t.expect(await keyv.get("cl-dm2")).toBe(undefined);
		t.expect(await keyv.get("cl-dm3")).toBe(undefined);

		await keyv.disconnect();
	},
);

test.it("cluster: hasMany should work without CROSSSLOT errors", async (t) => {
	const cluster = new Redis.Cluster(clusterNodes);
	const keyv = new KeyvValkey(cluster as Cluster);

	await keyv.set("cl-hm1", "val1");
	await keyv.set("cl-hm2", "val2");

	const results = await keyv.hasMany(["cl-hm1", "cl-hm2", "cl-hm3"]);
	t.expect(results).toEqual([true, true, false]);

	await keyv.disconnect();
});
