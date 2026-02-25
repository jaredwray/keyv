/**
 * Migration script for @keyv/mysql v6.
 *
 * In pre-v6, namespaces were stored as key prefixes (e.g. id="myns:mykey", namespace='').
 * In v6, the namespace is stored in a dedicated column (id="mykey", namespace="myns").
 *
 * This script migrates existing rows by splitting the prefixed key on the first colon,
 * moving the prefix into the namespace column.
 *
 * Usage:
 *   npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/db [--table keyv] [--keyLength 255] [--namespaceLength 255] [--dry-run]
 */

import mysql from "mysql2/promise";

function escapeIdentifier(identifier: string): string {
	return identifier
		.split(".")
		.map((segment) => `\`${segment.replace(/`/g, "``")}\``)
		.join(".");
}

function parseArgs(args: string[]): {
	uri: string;
	table: string;
	keyLength: number;
	namespaceLength: number;
	dryRun: boolean;
} {
	let uri = "";
	let table = "keyv";
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
			"Usage: npx tsx scripts/migrate-v6.ts --uri mysql://user:pass@localhost:3306/db [--table keyv] [--keyLength 255] [--namespaceLength 255] [--dry-run]",
		);
		process.exit(1);
	}

	return { uri, table, keyLength, namespaceLength, dryRun };
}

async function migrate(options: {
	uri: string;
	table: string;
	keyLength: number;
	namespaceLength: number;
	dryRun: boolean;
}): Promise<void> {
	const { uri, table, namespaceLength, dryRun } = options;
	const tableEsc = escapeIdentifier(table);

	const pool = mysql.createPool(uri);
	const connection = await pool.getConnection();

	try {
		// Schema migrations run outside the transaction so they persist
		// even when the data migration is a no-op or a dry run.
		try {
			await connection.query(
				`ALTER TABLE ${tableEsc} ADD COLUMN namespace VARCHAR(${Number(namespaceLength)}) NOT NULL DEFAULT ''`,
			);
		} catch (error) {
			if ((error as { errno?: number }).errno !== 1060) {
				throw error;
			}
		}

		try {
			await connection.query(`ALTER TABLE ${tableEsc} DROP PRIMARY KEY`);
		} catch (error) {
			if ((error as { errno?: number }).errno !== 1091) {
				throw error;
			}
		}

		const indexName = `\`${(table + "_key_namespace_idx").replace(/`/g, "``")}\``;
		try {
			await connection.query(
				`CREATE UNIQUE INDEX ${indexName} ON ${tableEsc} (id, namespace)`,
			);
		} catch (error) {
			if ((error as { errno?: number }).errno !== 1061) {
				throw error;
			}
		}

		// Preview what will be migrated
		const [rows] = await connection.query(
			`SELECT id AS old_key,
				SUBSTRING_INDEX(id, ':', 1) AS new_namespace,
				SUBSTRING(id, LOCATE(':', id) + 1) AS new_key
			FROM ${tableEsc}
			WHERE namespace = '' AND id LIKE '%:%'`,
		);

		const preview = rows as Array<{
			old_key: string;
			new_namespace: string;
			new_key: string;
		}>;

		if (preview.length === 0) {
			console.log("No rows to migrate. All keys are already in v6 format.");
			return;
		}

		console.log(`Found ${preview.length} row(s) to migrate:\n`);

		for (const row of preview) {
			console.log(
				`  "${row.old_key}" -> id="${row.new_key}", namespace="${row.new_namespace}"`,
			);
		}

		if (dryRun) {
			console.log("\nDry run — no changes made.");
			return;
		}

		// Perform the migration in a transaction
		await connection.beginTransaction();

		try {
			const [result] = await connection.query(
				`UPDATE ${tableEsc}
				SET namespace = SUBSTRING_INDEX(id, ':', 1),
					id = SUBSTRING(id, LOCATE(':', id) + 1)
				WHERE namespace = '' AND id LIKE '%:%'`,
			);

			await connection.commit();

			const affectedRows = (result as mysql.ResultSetHeader).affectedRows;
			console.log(`\nMigration complete. ${affectedRows} row(s) updated.`);
		} catch (error) {
			await connection.rollback();
			throw error;
		}
	} catch (error) {
		console.error("\nMigration failed, all changes rolled back.");
		console.error((error as Error).message);
		process.exit(1);
	} finally {
		connection.release();
		await pool.end();
	}
}

const options = parseArgs(process.argv.slice(2));
await migrate(options);
