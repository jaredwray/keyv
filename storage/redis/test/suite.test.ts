import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { afterAll, it } from "vitest";
import KeyvRedis, { type RedisClientType } from "../src/index.js";

const redisUrl = "redis://localhost:6379/5";
const store = () => new KeyvRedis(redisUrl);

afterAll(async () => {
	const client = (await store().getClient()) as RedisClientType;
	await client.flushDb();
	await store().disconnect();
});

keyvTestSuite(it, Keyv, store);
keyvIteratorTests(it, Keyv, store);
storageTestSuite(it, store);
