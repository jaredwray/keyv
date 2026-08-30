/**
 * Migration script for @keyv/postgres v6.
 *
 * In pre-v6, namespaces were stored as key prefixes (e.g. key="myns:mykey", namespace=NULL).
 * In v6, the namespace is stored in a dedicated column (key="mykey", namespace="myns").
 *
 * This script migrates existing rows by splitting the prefixed key on the first colon,
 * moving the prefix into the namespace column. It also drops the legacy single-column
 * primary key (required before two namespaces can share the same unprefixed key),
 * creates the v6 unique and expires indexes, and backfills the `expires` column from
 * legacy JSON envelopes.
 *
 * Dry-run mode only reads schema metadata and previews affected rows; it does not
 * modify the schema or data.
 *
 * Usage:
 *   node scripts/migrate-v6.ts --uri postgresql://user:pass@host:5432/db [--table keyv] [--schema public] [--keyLength 255] [--namespaceLength 255] [--dry-run]
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
			"Usage: node scripts/migrate-v6.ts --uri postgresql://user:pass@host:5432/db [--table keyv] [--schema public] [--keyLength 255] [--namespaceLength 255] [--dry-run]",
		);
		process.exit(1);
	}

	return { uri, table, schema, keyLength, namespaceLength, dryRun };
}

async function tableExists(
	client: pg.PoolClient,
	schema: string,
	table: string,
): Promise<boolean> {
	const result = await client.query(
		`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
		[schema, table],
	);
	return (result.rowCount ?? 0) > 0;
}

async function hasColumn(
	client: pg.PoolClient,
	schema: string,
	table: string,
	column: string,
): Promise<boolean> {
	const result = await client.query(
		`SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
		[schema, table, column],
	);
	return (result.rowCount ?? 0) > 0;
}

async function columnCharacterMaximumLength(
	client: pg.PoolClient,
	schema: string,
	table: string,
	column: string,
): Promise<number | undefined> {
	const result = await client.query(
		`SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
		[schema, table, column],
	);
	const length = result.rows[0]?.character_maximum_length;
	return typeof length === "number" ? length : undefined;
}

async function dropPrimaryKey(
	client: pg.PoolClient,
	schema: string,
	table: string,
	schemaEsc: string,
	tableEsc: string,
): Promise<void> {
	const result = await client.query(
		`SELECT c.conname
		FROM pg_constraint c
		JOIN pg_class t ON c.conrelid = t.oid
		JOIN pg_namespace n ON t.relnamespace = n.oid
		WHERE n.nspname = $1 AND t.relname = $2 AND c.contype = 'p'`,
		[schema, table],
	);

	for (const row of result.rows) {
		await client.query(
			`ALTER TABLE ${schemaEsc}.${tableEsc} DROP CONSTRAINT IF EXISTS ${escapeIdentifier(row.conname)}`,
		);
	}
}

async function ensureIndexes(
	client: pg.PoolClient,
	schemaEsc: string,
	tableEsc: string,
	table: string,
): Promise<void> {
	const qualifiedTable = `${schemaEsc}.${tableEsc}`;
	await client.query(
		`CREATE UNIQUE INDEX IF NOT EXISTS ${escapeIdentifier(`${table}_key_namespace_idx`)} ON ${qualifiedTable} (key, COALESCE(namespace, ''))`,
	);
	await client.query(
		`CREATE INDEX IF NOT EXISTS ${escapeIdentifier(`${table}_expires_idx`)} ON ${qualifiedTable} (expires) WHERE expires IS NOT NULL`,
	);
}

async function populateExpires(client: pg.PoolClient, qualifiedTable: string): Promise<void> {
	const expiresWhere = `expires IS NULL AND value IS NOT NULL AND value ~ '"expires"\\s*:\\s*[0-9]+'`;
	const preview = await client.query(
		`SELECT COUNT(*)::int AS cnt FROM ${qualifiedTable} WHERE ${expiresWhere}`,
	);
	const expiresCount = preview.rows[0]?.cnt ?? 0;

	if (expiresCount === 0) {
		console.log("\nNo rows need expires column population.");
		return;
	}

	console.log(`\nFound ${expiresCount} row(s) with expires to populate.`);

	try {
		const result = await client.query(
			`UPDATE ${qualifiedTable}
			SET expires = CAST((trim(value)::json)->>'expires' AS BIGINT)
			WHERE ${expiresWhere} AND left(trim(value), 1) = '{'`,
		);
		console.log(`Expires column populated for ${result.rowCount} row(s).`);
	} catch (error) {
		const result = await client.query(
			`UPDATE ${qualifiedTable}
			SET expires = CAST(substring(value FROM '"expires"\\s*:\\s*([0-9]+)\\s*\\}\\s*$') AS BIGINT)
			WHERE ${expiresWhere}`,
		);
		console.log(
			`Expires column populated for ${result.rowCount} row(s) via fallback parser (${(error as Error).message}).`,
		);
	}
}

async function migrate(options: {
	uri: string;
	table: string;
	schema: string;
	keyLength: number;
	namespaceLength: number;
	dryRun: boolean;
}): Promise<void> {
	const { uri, table, schema, keyLength, namespaceLength, dryRun } = options;
	const schemaEsc = escapeIdentifier(schema);
	const tableEsc = escapeIdentifier(table);
	const qualifiedTable = `${schemaEsc}.${tableEsc}`;

	const pool = new pg.Pool({ connectionString: uri });
	const client = await pool.connect();

	try {
		if (!(await tableExists(client, schema, table))) {
			throw new Error(`Table ${schema}.${table} does not exist`);
		}

		let namespaceColumnExists = await hasColumn(client, schema, table, "namespace");

		if (!dryRun) {
			await client.query(
				`ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS namespace VARCHAR(${Number(namespaceLength)}) DEFAULT NULL`,
			);
			await client.query(
				`ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS expires BIGINT DEFAULT NULL`,
			);
			namespaceColumnExists = true;

			const keyWidth = await columnCharacterMaximumLength(client, schema, table, "key");
			if (keyWidth !== undefined && keyWidth !== keyLength) {
				await client.query(
					`ALTER TABLE ${qualifiedTable} ALTER COLUMN key TYPE VARCHAR(${Number(keyLength)})`,
				);
			}

			const namespaceWidth = await columnCharacterMaximumLength(
				client,
				schema,
				table,
				"namespace",
			);
			if (namespaceWidth !== undefined && namespaceWidth !== namespaceLength) {
				await client.query(
					`ALTER TABLE ${qualifiedTable} ALTER COLUMN namespace TYPE VARCHAR(${Number(namespaceLength)})`,
				);
			}

			// Drop the legacy single-column primary key before rewriting keys so two
			// namespaces can share the same unprefixed key (e.g. ns1:foo and ns2:foo).
			await dropPrimaryKey(client, schema, table, schemaEsc, tableEsc);
		}

		const candidateWhere = namespaceColumnExists
			? "namespace IS NULL AND key LIKE '%:%'"
			: "key LIKE '%:%'";

		const countResult = await client.query(
			`SELECT COUNT(*)::int AS cnt FROM ${qualifiedTable} WHERE ${candidateWhere}`,
		);
		const count = countResult.rows[0]?.cnt ?? 0;

		if (count === 0) {
			console.log("No rows to migrate. All keys are already in v6 format.");
			if (!dryRun) {
				await ensureIndexes(client, schemaEsc, tableEsc, table);
				await populateExpires(client, qualifiedTable);
			}

			return;
		}

		const preview = await client.query(
			`SELECT key AS old_key,
				SPLIT_PART(key, ':', 1) AS new_namespace,
				SUBSTR(key, POSITION(':' IN key) + 1) AS new_key
			FROM ${qualifiedTable}
			WHERE ${candidateWhere}
			ORDER BY key
			LIMIT 20`,
		);

		console.log(`Found ${count} row(s) to migrate:\n`);
		for (const row of preview.rows) {
			console.log(`  "${row.old_key}" -> key="${row.new_key}", namespace="${row.new_namespace}"`);
		}

		if (count > preview.rows.length) {
			console.log(`  ... and ${count - preview.rows.length} more`);
		}

		if (dryRun) {
			console.log("\nDry run — no changes made.");
			return;
		}

		await client.query("BEGIN");
		try {
			const result = await client.query(`
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
			`);
			await client.query("COMMIT");
			console.log(`\nMigration complete. ${result.rowCount} row(s) updated.`);
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}

		await ensureIndexes(client, schemaEsc, tableEsc, table);
		await populateExpires(client, qualifiedTable);
	} catch (error) {
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
