/**
 * Migration script for @keyv/mongo v6.
 *
 * Keyv v5 stored a document's namespace as a prefix of its key (key="keyv:foo") and wrote
 * no namespace field. v6 stores the namespace in its own field (key="foo", namespace="keyv")
 * and only reads documents that have one, so documents written by v5 stay invisible until
 * they are migrated. v5 used the namespace "keyv" when none was set, so most v5 documents
 * migrate into namespace "keyv".
 *
 * The script finds documents with no namespace field, splits each key on its first colon,
 * and moves the prefix into the namespace field. A key without a colon gets the empty
 * namespace that v6 uses when none is set. In standard mode it first replaces v5's unique
 * index on `key` with v6's unique index on `{ key, namespace }`.
 *
 * A v5 document is left unchanged when v6 already stores a value under the same key and
 * namespace, because that value was written after the upgrade. In GridFS mode, where v5 kept
 * every revision of a file, only the newest revision of each key is migrated: the one v5 read.
 * Documents the script leaves unchanged stay invisible to v6.
 *
 * Dry-run mode only counts and previews the documents that would change.
 *
 * Usage:
 *   npx tsx node_modules/@keyv/mongo/scripts/migrate-v6.ts --uri mongodb://user:pass@host:27017/db [--db name] [--collection keyv] [--gridfs] [--dry-run]
 */

import {
	type AnyBulkWriteOperation,
	type Collection,
	type Db,
	type Document,
	MongoBulkWriteError,
	MongoClient,
} from "mongodb";

const PREVIEW_LIMIT = 20;
const BATCH_SIZE = 1000;
const DUPLICATE_KEY_ERROR = 11000;

type Options = {
	uri: string;
	db: string | undefined;
	collection: string;
	gridfs: boolean;
	dryRun: boolean;
};

function parseArgs(args: string[]): Options {
	let uri = "";
	let db: string | undefined;
	let collection = "keyv";
	let gridfs = false;
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--uri":
				uri = args[++i] ?? "";
				break;
			case "--db":
				db = args[++i];
				break;
			case "--collection":
				collection = args[++i] ?? "keyv";
				break;
			case "--gridfs":
				gridfs = true;
				break;
			case "--dry-run":
				dryRun = true;
				break;
		}
	}

	if (!uri) {
		console.error("Error: --uri is required");
		console.error(
			"Usage: npx tsx scripts/migrate-v6.ts --uri mongodb://user:pass@host:27017/db [--db name] [--collection keyv] [--gridfs] [--dry-run]",
		);
		process.exit(1);
	}

	return { uri, db, collection, gridfs, dryRun };
}

/**
 * Splits a v5 key on its first colon into the v6 namespace and key. A key without a colon
 * was stored without a namespace, which v6 represents as the empty string.
 */
function splitKey(stored: string): { namespace: string; key: string } {
	const separator = stored.indexOf(":");
	if (separator === -1) {
		return { namespace: "", key: stored };
	}

	return { namespace: stored.slice(0, separator), key: stored.slice(separator + 1) };
}

async function printPreview(
	collection: Collection,
	filter: Document,
	field: "key" | "filename",
	count: number,
	noun: string,
): Promise<void> {
	console.log(`Found ${count} ${noun}(s) to migrate:\n`);
	const rows = await collection
		.find(filter, { projection: { [field]: 1 } })
		.sort({ [field]: 1 })
		.limit(PREVIEW_LIMIT)
		.toArray();
	for (const row of rows) {
		const { namespace, key } = splitKey(String(row[field]));
		console.log(`  "${String(row[field])}" -> ${field}="${key}", namespace="${namespace}"`);
	}

	if (count > rows.length) {
		console.log(`  ... and ${count - rows.length} more`);
	}
}

function printSkipped(skipped: string[], reason: string): void {
	if (skipped.length === 0) {
		return;
	}

	console.log(`\n${skipped.length} left unchanged because ${reason}`);
	console.log("v6 cannot read them. Delete them once you have checked the migration:");
	for (const stored of skipped.slice(0, PREVIEW_LIMIT)) {
		console.log(`  "${stored}"`);
	}

	if (skipped.length > PREVIEW_LIMIT) {
		console.log(`  ... and ${skipped.length - PREVIEW_LIMIT} more`);
	}
}

async function migrateCollection(db: Db, options: Options): Promise<void> {
	const collection = db.collection(options.collection);
	const filter = { namespace: { $exists: false } };
	const count = await collection.countDocuments(filter);

	if (count === 0) {
		console.log("No documents to migrate. Every document already has a namespace.");
		return;
	}

	await printPreview(collection, filter, "key", count, "document");

	if (options.dryRun) {
		console.log("\nDry run — no changes made.");
		return;
	}

	// v5's unique index on `key` alone would reject two namespaces that share a key
	// (ns1:foo and ns2:foo both become key "foo"), so replace it before rewriting keys.
	if (await collection.indexExists("key_1")) {
		await collection.dropIndex("key_1");
	}

	await collection.createIndex({ key: 1, namespace: 1 }, { unique: true, background: true });

	let migrated = 0;
	const skipped: string[] = [];
	let operations: AnyBulkWriteOperation[] = [];
	let storedKeys: string[] = [];

	const flush = async (): Promise<void> => {
		if (operations.length === 0) {
			return;
		}

		const batch = operations;
		const batchKeys = storedKeys;
		operations = [];
		storedKeys = [];

		try {
			const result = await collection.bulkWrite(batch, { ordered: false });
			migrated += result.modifiedCount;
		} catch (error) {
			if (!(error instanceof MongoBulkWriteError)) {
				throw error;
			}

			const writeErrors = Array.isArray(error.writeErrors)
				? error.writeErrors
				: [error.writeErrors];
			if (writeErrors.some((writeError) => writeError.code !== DUPLICATE_KEY_ERROR)) {
				throw error;
			}

			// A duplicate means v6 already stores this key and namespace. Its value was
			// written after the upgrade, so it wins and the v5 document stays as it is.
			migrated += error.result.modifiedCount;
			for (const writeError of writeErrors) {
				skipped.push(batchKeys[writeError.index]);
			}
		}
	};

	// Iterate in _id order: rewriting `key` never moves a document within that order.
	const cursor = collection.find(filter, { projection: { key: 1 } }).sort({ _id: 1 });
	for await (const document of cursor) {
		const stored = String(document.key);
		const { namespace, key } = splitKey(stored);
		operations.push({
			updateOne: {
				filter: { _id: document._id, namespace: { $exists: false } },
				update: { $set: { key, namespace } },
			},
		});
		storedKeys.push(stored);
		if (operations.length >= BATCH_SIZE) {
			await flush();
		}
	}

	await flush();

	console.log(`\nMigration complete. ${migrated} document(s) updated.`);
	printSkipped(
		skipped,
		"v6 already stores a value under the same key and namespace. That value was written after the upgrade.",
	);
}

async function migrateGridFS(db: Db, options: Options): Promise<void> {
	const files = db.collection(`${options.collection}.files`);
	const filter = { "metadata.namespace": { $exists: false } };
	const count = await files.countDocuments(filter);

	if (count === 0) {
		console.log("No files to migrate. Every file already has a namespace.");
		return;
	}

	await printPreview(files, filter, "filename", count, "file");

	if (options.dryRun) {
		console.log("\nDry run — no changes made.");
		return;
	}

	let migrated = 0;
	const skipped: string[] = [];

	// v5 wrote a new file on every set and read the newest one, so walk newest first and
	// migrate only the first file seen for each key. Anything left over is an older revision,
	// or a key that v6 has already written since the upgrade.
	const cursor = files
		.find(filter, { projection: { filename: 1 } })
		.sort({ uploadDate: -1, _id: -1 });
	for await (const file of cursor) {
		const stored = String(file.filename);
		const { namespace, key } = splitKey(stored);
		const current = await files.findOne(
			{ filename: key, "metadata.namespace": namespace },
			{ projection: { _id: 1 } },
		);
		if (current) {
			skipped.push(stored);
			continue;
		}

		const result = await files.updateOne(
			{ _id: file._id, "metadata.namespace": { $exists: false } },
			{ $set: { filename: key, "metadata.namespace": namespace } },
		);
		migrated += result.modifiedCount;
	}

	console.log(`\nMigration complete. ${migrated} file(s) updated.`);
	printSkipped(
		skipped,
		"a newer file already holds the same key and namespace. They are older v5 revisions, or keys written after the upgrade.",
	);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const client = new MongoClient(options.uri);

	try {
		await client.connect();
		const db = client.db(options.db);
		const name = options.gridfs ? `${options.collection}.files` : options.collection;
		const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
		if (!exists) {
			throw new Error(`Collection ${name} does not exist in database ${db.databaseName}`);
		}

		if (options.gridfs) {
			await migrateGridFS(db, options);
		} else {
			await migrateCollection(db, options);
		}
	} catch (error) {
		console.error("\nMigration failed.");
		console.error((error as Error).message);
		console.error("Documents already migrated keep their new layout. Rerun the script to finish.");
		process.exitCode = 1;
	} finally {
		await client.close();
	}
}

await main();
