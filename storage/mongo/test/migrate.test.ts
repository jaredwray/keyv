import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { faker } from "@faker-js/faker";
import Keyv from "keyv";
import { type Db, GridFSBucket, MongoClient } from "mongodb";
import { describe, expect, test } from "vitest";
import KeyvMongo from "../src/index.js";

const mongoURL = "mongodb://127.0.0.1:27017";
const dbName = "keyvdb";
const execFileAsync = promisify(execFile);
const migrateCwd = new URL("../", import.meta.url);

async function runMigrate(args: string[]): Promise<{ stdout: string; stderr: string }> {
	return execFileAsync(
		process.execPath,
		["--experimental-strip-types", "scripts/migrate-v6.ts", ...args],
		{ cwd: migrateCwd, encoding: "utf8" },
	);
}

/** Runs `callback` against the test database, then drops the given collections. */
async function withDatabase(
	collections: string[],
	callback: (db: Db) => Promise<void>,
): Promise<void> {
	const client = new MongoClient(mongoURL);
	await client.connect();
	const db = client.db(dbName);
	try {
		await callback(db);
	} finally {
		for (const name of collections) {
			await db
				.collection(name)
				.drop()
				.catch(() => {});
		}

		await client.close();
	}
}

/** Writes documents in the layout Keyv v5 and @keyv/mongo v3 used, with v5's indexes. */
async function seedV5Collection(db: Db, collection: string, entries: Record<string, unknown>) {
	const store = db.collection(collection);
	await store.createIndex({ key: 1 }, { unique: true });
	await store.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
	await store.insertMany(
		Object.entries(entries).map(([key, value]) => ({
			key,
			value: JSON.stringify({ value }),
			expiresAt: null,
		})),
	);
}

/** Uploads a GridFS file the way @keyv/mongo v3 did, and waits for it to finish. */
async function uploadV5File(bucket: GridFSBucket, filename: string, value: unknown) {
	await new Promise<void>((resolve, reject) => {
		const stream = bucket.openUploadStream(filename, {
			metadata: { expiresAt: null, lastAccessed: new Date() },
		});
		stream.on("finish", () => resolve());
		stream.on("error", reject);
		stream.end(JSON.stringify({ value }));
	});
}

async function readThroughKeyv(
	adapterOptions: Record<string, unknown>,
	namespace: string | undefined,
	key: string,
): Promise<unknown> {
	const keyv = new Keyv(new KeyvMongo({ url: mongoURL, db: dbName, ...adapterOptions }), {
		namespace,
	});
	try {
		return await keyv.get(key);
	} finally {
		await keyv.disconnect();
	}
}

describe("v6 migration script", () => {
	test("requires --uri", async () => {
		await expect(runMigrate([])).rejects.toMatchObject({
			stderr: expect.stringContaining("--uri is required"),
		});
	});

	test("fails when the collection does not exist", async () => {
		const collection = `missing_${faker.string.alphanumeric(12)}`;
		await expect(
			runMigrate(["--uri", mongoURL, "--db", dbName, "--collection", collection]),
		).rejects.toMatchObject({
			stderr: expect.stringContaining("does not exist"),
		});
	});

	test("dry-run previews v5 documents without changing documents or indexes", async () => {
		const collection = `migrate_${faker.string.alphanumeric(12)}`;
		await withDatabase([collection], async (db) => {
			await seedV5Collection(db, collection, { "keyv:foo": "bar" });

			const { stdout } = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
				"--dry-run",
			]);

			expect(stdout).toContain('"keyv:foo" -> key="foo", namespace="keyv"');
			expect(stdout).toContain("Dry run");
			const documents = await db.collection(collection).find().toArray();
			expect(documents).toHaveLength(1);
			expect(documents[0].key).toBe("keyv:foo");
			expect(documents[0]).not.toHaveProperty("namespace");
			expect(await db.collection(collection).indexExists("key_1")).toBe(true);
		});
	});

	test("migrates v5 documents so KeyvMongo reads them under their namespace", async () => {
		const collection = `migrate_${faker.string.alphanumeric(12)}`;
		await withDatabase([collection], async (db) => {
			await seedV5Collection(db, collection, {
				"keyv:foo": "bar",
				"keyv:user:1": { name: "Ada" },
				"sessions:abc": 42,
				"a:shared": "from a",
				"b:shared": "from b",
				plain: "no prefix",
			});

			const { stdout } = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
			]);

			expect(stdout).toContain("Migration complete. 6 document(s) updated.");
			expect(await db.collection(collection).indexExists("key_1")).toBe(false);
			const indexes = await db.collection(collection).indexes();
			expect(indexes.find((index) => index.name === "key_1_namespace_1")?.unique).toBe(true);

			const options = { collection };
			expect(await readThroughKeyv(options, "keyv", "foo")).toBe("bar");
			expect(await readThroughKeyv(options, "keyv", "user:1")).toEqual({ name: "Ada" });
			expect(await readThroughKeyv(options, "sessions", "abc")).toBe(42);
			expect(await readThroughKeyv(options, "a", "shared")).toBe("from a");
			expect(await readThroughKeyv(options, "b", "shared")).toBe("from b");
			expect(await readThroughKeyv(options, undefined, "plain")).toBe("no prefix");

			const rerun = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
			]);
			expect(rerun.stdout).toContain("No documents to migrate");
		});
	});

	test("keeps a value v6 wrote after the upgrade and leaves the v5 document", async () => {
		const collection = `migrate_${faker.string.alphanumeric(12)}`;
		await withDatabase([collection], async (db) => {
			await seedV5Collection(db, collection, { "keyv:foo": "old v5 value" });
			await db.collection(collection).insertOne({
				key: "foo",
				namespace: "keyv",
				value: JSON.stringify({ value: "new v6 value" }),
				expiresAt: null,
			});

			const { stdout } = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
			]);

			expect(stdout).toContain("Migration complete. 0 document(s) updated.");
			expect(stdout).toContain('"keyv:foo"');
			expect(await readThroughKeyv({ collection }, "keyv", "foo")).toBe("new v6 value");
			const legacy = await db.collection(collection).findOne({ key: "keyv:foo" });
			expect(legacy).not.toBeNull();
			expect(legacy).not.toHaveProperty("namespace");
		});
	});

	test("migrates the newest GridFS revision of each v5 key", async () => {
		const collection = `migratefs_${faker.string.alphanumeric(12)}`;
		await withDatabase([`${collection}.files`, `${collection}.chunks`], async (db) => {
			const bucket = new GridFSBucket(db, { bucketName: collection });
			await uploadV5File(bucket, "keyv:doc", "first revision");
			await uploadV5File(bucket, "keyv:doc", "second revision");
			await uploadV5File(bucket, "sessions:other", "only revision");

			const dryRun = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
				"--gridfs",
				"--dry-run",
			]);
			expect(dryRun.stdout).toContain("Found 3 file(s) to migrate");
			expect(
				await db.collection(`${collection}.files`).countDocuments({
					"metadata.namespace": { $exists: true },
				}),
			).toBe(0);

			const { stdout } = await runMigrate([
				"--uri",
				mongoURL,
				"--db",
				dbName,
				"--collection",
				collection,
				"--gridfs",
			]);

			expect(stdout).toContain("Migration complete. 2 file(s) updated.");
			expect(stdout).toContain('"keyv:doc"');
			const migrated = await db
				.collection(`${collection}.files`)
				.find({ filename: "doc", "metadata.namespace": "keyv" })
				.toArray();
			expect(migrated).toHaveLength(1);

			const options = { collection, useGridFS: true };
			expect(await readThroughKeyv(options, "keyv", "doc")).toBe("second revision");
			expect(await readThroughKeyv(options, "sessions", "other")).toBe("only revision");
		});
	});
});
