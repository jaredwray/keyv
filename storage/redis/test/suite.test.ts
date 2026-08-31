import { keyvIteratorTests, keyvTestSuite, storageTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { afterAll, test } from "vitest";
import KeyvRedis, { type RedisClientType } from "../src/index.js";

const redisUrl = "redis://localhost:6379/5";
const store = () => new KeyvRedis(redisUrl);

afterAll(async () => {
	const client = (await store().getClient()) as RedisClientType;
	await client.flushDb();
	await store().disconnect();
});

keyvTestSuite(test, Keyv, store);
keyvIteratorTests(test, Keyv, store);
storageTestSuite(test, store);
