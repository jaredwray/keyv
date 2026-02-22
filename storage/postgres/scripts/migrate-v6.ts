/**
 * Migration script for @keyv/postgres v6.
 *
 * In pre-v6, namespaces were stored as key prefixes (e.g. key="myns:mykey", namespace=NULL).
 * In v6, the namespace is stored in a dedicated column (key="mykey", namespace="myns").
 *
 * This script migrates existing rows by splitting the prefixed key on the first colon,
 * moving the prefix into the namespace column.
 *
 * Usage:
 *   npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@host:5432/db [--table keyv] [--schema public] [--keyLength 255] [--namespaceLength 255] [--dry-run]
 */

import pg from "pg";

function escapeIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function parseArgs(args: string[]): {
	uri: string;
	table: string;
	schema: string;
	keyLength: number;
	namespaceLength: number;
	dryRun: boolean;
} {
	let uri = "";
	let table = "keyv";
	let schema = "public";
	let keyLength = 255;
	let namespaceLength = 255;
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--uri":
				uri = args[++i] ?? "";
				break;
			case "--table":
				table = args[++i] ?? "keyv";
				break;
			case "--schema":
				schema = args[++i] ?? "public";
				break;
			case "--keyLength":
				keyLength = Number(args[++i] ?? 255);
				break;
			case "--namespaceLength":
				namespaceLength = Number(args[++i] ?? 255);
				break;
			case "--dry-run":
				dryRun = true;
				break;
		}
	}

	if (!uri) {
		console.error("Error: --uri is required");
		console.error(
			"Usage: npx tsx scripts/migrate-v6.ts --uri postgresql://user:pass@host:5432/db [--table keyv] [--schema public] [--keyLength 255] [--namespaceLength 255] [--dry-run]",
		);
		process.exit(1);
	}

	return { uri, table, schema, keyLength, namespaceLength, dryRun };
}

async function migrate(options: {
	uri: string;
	table: string;
	schema: string;
	keyLength: number;
	namespaceLength: number;
	dryRun: boolean;
}): Promise<void> {
	const { uri, table, schema, namespaceLength, dryRun } = options;
	const schemaEsc = escapeIdentifier(schema);
	const tableEsc = escapeIdentifier(table);
	const qualifiedTable = `${schemaEsc}.${tableEsc}`;

	const pool = new pg.Pool({ connectionString: uri });
	const client = await pool.connect();

	try {
		// Schema migrations run outside the transaction so they persist
		// even when the data migration is a no-op or a dry run.
		await client.query(
			`ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS namespace VARCHAR(${Number(namespaceLength)}) DEFAULT NULL`,
		);
		await client.query(
			`ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS expires BIGINT DEFAULT NULL`,
		);

		await client.query("BEGIN");

		// Preview what will be migrated
		const previewQuery = `
			SELECT key AS old_key,
				SPLIT_PART(key, ':', 1) AS new_namespace,
				SUBSTR(key, POSITION(':' IN key) + 1) AS new_key
			FROM ${qualifiedTable}
			WHERE namespace IS NULL AND key LIKE '%:%'
		`;

		const preview = await client.query(previewQuery);

		if (preview.rows.length === 0) {
			console.log("No rows to migrate. All keys are already in v6 format.");
			await client.query("ROLLBACK");
			return;
		}

		console.log(`Found ${preview.rows.length} row(s) to migrate:\n`);

		for (const row of preview.rows) {
			console.log(
				`  "${row.old_key}" -> key="${row.new_key}", namespace="${row.new_namespace}"`,
			);
		}

		if (dryRun) {
			console.log("\nDry run — no changes made.");
			await client.query("ROLLBACK");
			return;
		}

		// Perform the migration in a single UPDATE using a CTE
		const migrateQuery = `
			WITH migrated AS (
				SELECT key AS old_key,
					SPLIT_PART(key, ':', 1) AS new_namespace,
					SUBSTR(key, POSITION(':' IN key) + 1) AS new_key
				FROM ${qualifiedTable}
				WHERE namespace IS NULL AND key LIKE '%:%'
			)
			UPDATE ${qualifiedTable} t
			SET key = m.new_key, namespace = m.new_namespace
			FROM migrated m
			WHERE t.key = m.old_key AND t.namespace IS NULL
		`;

		const result = await client.query(migrateQuery);
		await client.query("COMMIT");

		console.log(`\nMigration complete. ${result.rowCount} row(s) updated.`);
	} catch (error) {
		await client.query("ROLLBACK");
		console.error("\nMigration failed, all changes rolled back.");
		console.error((error as Error).message);
		process.exit(1);
	} finally {
		client.release();
		await pool.end();
	}
}

const options = parseArgs(process.argv.slice(2));
await migrate(options);
