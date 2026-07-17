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

const UTF8_MAX_BYTES_PER_CODE_POINT = 4;
const MYSQL_MAX_COMPOSITE_INDEX_BYTES = 3072;

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
	const { uri, table, keyLength, namespaceLength, dryRun } = options;
	const tableEsc = escapeIdentifier(table);
	const keyByteLength = keyLength * UTF8_MAX_BYTES_PER_CODE_POINT;
	const namespaceByteLength = namespaceLength * UTF8_MAX_BYTES_PER_CODE_POINT;
	const configuredIndexByteLength = keyByteLength + namespaceByteLength;
	if (configuredIndexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
		throw new RangeError(
			`keyLength and namespaceLength require ${configuredIndexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
		);
	}

	const pool = mysql.createPool(uri);
	const connection = await pool.getConnection();

	try {
		const [existingKeyColumns] = await connection.query(
			`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
		);
		const existingColumns = existingKeyColumns as mysql.RowDataPacket[];
		let hasNamespaceColumn = existingColumns.some(
			(column) => column.Field === "namespace",
		);

		if (!dryRun) {
			// Schema migrations run outside the transaction so they persist even when
			// the data migration is a no-op.
			const existingIdColumn = existingColumns.find((column) => column.Field === "id");
			const existingNamespaceColumn = existingColumns.find(
				(column) => column.Field === "namespace",
			);
			if (!existingIdColumn) {
				throw new Error(`Table ${table} does not have an id column`);
			}

			const getColumnLength = (column: mysql.RowDataPacket): number => {
				const match = /\((\d+)\)/.exec(String(column.Type));
				if (!match) {
					throw new Error(`Cannot determine the width of ${String(column.Field)}`);
				}

				return Number(match[1]);
			};
			const getTargetByteLength = (column: mysql.RowDataPacket): number => {
				const columnLength = getColumnLength(column);
				return String(column.Type).toLowerCase().startsWith("varbinary(")
					? columnLength
					: columnLength * UTF8_MAX_BYTES_PER_CODE_POINT;
			};
			const existingTargetIndexByteLength =
				getTargetByteLength(existingIdColumn) +
				(existingNamespaceColumn
					? getTargetByteLength(existingNamespaceColumn)
					: namespaceByteLength);
			if (existingTargetIndexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
				throw new RangeError(
					`Existing key columns require ${existingTargetIndexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
				);
			}

			if (!hasNamespaceColumn) {
				try {
					await connection.query(
						`ALTER TABLE ${tableEsc} ADD COLUMN namespace VARBINARY(${namespaceByteLength}) NOT NULL DEFAULT ''`,
					);
				} catch (error) {
					if ((error as { errno?: number }).errno !== 1060) {
						throw error;
					}
				}
				hasNamespaceColumn = true;
			}

			const [keyColumnsResult] = await connection.query(
				`SHOW COLUMNS FROM ${tableEsc} WHERE Field IN ('id', 'namespace')`,
			);
			const keyColumns = keyColumnsResult as mysql.RowDataPacket[];
			const idColumn = keyColumns.find((column) => column.Field === "id");
			const namespaceColumn = keyColumns.find((column) => column.Field === "namespace");
			if (!idColumn || !namespaceColumn) {
				throw new Error(`Table ${table} must have id and namespace columns`);
			}
			const targetIndexByteLength =
				getTargetByteLength(idColumn) + getTargetByteLength(namespaceColumn);
			if (targetIndexByteLength > MYSQL_MAX_COMPOSITE_INDEX_BYTES) {
				throw new RangeError(
					`Existing key columns require ${targetIndexByteLength} index bytes, exceeding MySQL's ${MYSQL_MAX_COMPOSITE_INDEX_BYTES}-byte composite index limit`,
				);
			}

			const idNeedsMigration = !String(idColumn.Type)
				.toLowerCase()
				.startsWith("varbinary(");
			const namespaceNeedsMigration = !String(namespaceColumn.Type)
				.toLowerCase()
				.startsWith("varbinary(");
			if (idNeedsMigration || namespaceNeedsMigration) {
				const modifyVarcharParts: string[] = [];
				const modifyVarbinaryParts: string[] = [];
				if (idNeedsMigration) {
					const idCharacterLength = getColumnLength(idColumn);
					modifyVarcharParts.push(
						`MODIFY COLUMN id VARCHAR(${idCharacterLength}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL`,
					);
					modifyVarbinaryParts.push(
						`MODIFY COLUMN id VARBINARY(${idCharacterLength * UTF8_MAX_BYTES_PER_CODE_POINT}) NOT NULL`,
					);
				}

				if (namespaceNeedsMigration) {
					const namespaceCharacterLength = getColumnLength(namespaceColumn);
					modifyVarcharParts.push(
						`MODIFY COLUMN namespace VARCHAR(${namespaceCharacterLength}) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT ''`,
					);
					modifyVarbinaryParts.push(
						`MODIFY COLUMN namespace VARBINARY(${namespaceCharacterLength * UTF8_MAX_BYTES_PER_CODE_POINT}) NOT NULL DEFAULT ''`,
					);
				}

				// Convert text to UTF-8 first, then preserve those exact bytes in VARBINARY.
				await connection.query(
					`ALTER TABLE ${tableEsc} ${modifyVarcharParts.join(", ")}`,
				);
				await connection.query(
					`ALTER TABLE ${tableEsc} ${modifyVarbinaryParts.join(", ")}`,
				);
			}

			try {
				await connection.query(`ALTER TABLE ${tableEsc} DROP PRIMARY KEY`);
			} catch (error) {
				if ((error as { errno?: number }).errno !== 1091) {
					throw error;
				}
			}

			const indexNameValue = `${table}_key_namespace_idx`;
			const indexName = `\`${indexNameValue.replace(/`/g, "``")}\``;
			const [indexRowsResult] = await connection.query(
				mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name = ?`, [indexNameValue]),
			);
			const indexRows = indexRowsResult as mysql.RowDataPacket[];
			const indexColumns = [...indexRows]
				.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
				.map((row) => String(row.Column_name));
			const hasNamespaceFirstUniqueIndex =
				indexColumns.length === 2 &&
				indexColumns[0] === "namespace" &&
				indexColumns[1] === "id" &&
				indexRows.every((row) => Number(row.Non_unique) === 0);

			if (!hasNamespaceFirstUniqueIndex) {
				if (indexRows.length > 0) {
					await connection.query(
						`ALTER TABLE ${tableEsc} DROP INDEX ${indexName}, ADD UNIQUE INDEX ${indexName} (namespace, id)`,
					);
				} else {
					try {
						await connection.query(
							`CREATE UNIQUE INDEX ${indexName} ON ${tableEsc} (namespace, id)`,
						);
					} catch (error) {
						if ((error as { errno?: number }).errno !== 1061) {
							throw error;
						}
					}
				}
			}

			// Migration: add expires column
			try {
				await connection.query(
					`ALTER TABLE ${tableEsc} ADD COLUMN expires BIGINT UNSIGNED DEFAULT NULL`,
				);
			} catch (error) {
				if ((error as { errno?: number }).errno !== 1060) {
					throw error;
				}
			}

			const expiresIndexName = `\`${(table + "_expires_idx").replace(/`/g, "``")}\``;
			try {
				await connection.query(
					`CREATE INDEX ${expiresIndexName} ON ${tableEsc} (expires)`,
				);
			} catch (error) {
				if ((error as { errno?: number }).errno !== 1061) {
					throw error;
				}
			}
		}

		// Preview what will be migrated
		const [rows] = await connection.query(
			`SELECT CONVERT(id USING utf8mb4) AS old_key,
				CONVERT(SUBSTRING_INDEX(id, ':', 1) USING utf8mb4) AS new_namespace,
				CONVERT(SUBSTRING(id, LOCATE(':', id) + 1) USING utf8mb4) AS new_key
			FROM ${tableEsc}
			WHERE ${hasNamespaceColumn ? "namespace = '' AND " : ""}id LIKE '%:%'`,
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
			console.log(`\nNamespace migration complete. ${affectedRows} row(s) updated.`);
		} catch (error) {
			await connection.rollback();
			throw error;
		}

		// Populate expires column from existing JSON values
		const [expiresPreview] = await connection.query(
			`SELECT COUNT(*) AS cnt FROM ${tableEsc}
			WHERE expires IS NULL AND JSON_VALID(value) AND value->'$.expires' IS NOT NULL`,
		);

		const expiresCount = (expiresPreview as Array<{ cnt: number }>)[0].cnt;

		if (expiresCount > 0) {
			console.log(`\nFound ${expiresCount} row(s) with expires to populate.`);

			if (!dryRun) {
				const [expiresResult] = await connection.query(
					`UPDATE ${tableEsc}
					SET expires = CAST(value->'$.expires' AS UNSIGNED)
					WHERE expires IS NULL AND JSON_VALID(value) AND value->'$.expires' IS NOT NULL`,
				);

				const expiresUpdated = (expiresResult as mysql.ResultSetHeader).affectedRows;
				console.log(`Expires column populated for ${expiresUpdated} row(s).`);
			} else {
				console.log("Dry run — expires column not populated.");
			}
		} else {
			console.log("\nNo rows need expires column population.");
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
