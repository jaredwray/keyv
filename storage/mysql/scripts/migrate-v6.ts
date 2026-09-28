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

type IndexColumn = {
	/** The column's name, in lowercase. */
	name: string;
	/** How many leading bytes or characters the index covers, or `null` when it covers all of them. */
	prefixLength: number | null;
};

/**
 * Lists the ALTER TABLE changes that make (namespace, id) unique, as the adapter does. The primary
 * key becomes (namespace, id) when the table has none, when it is only on the namespace and id
 * columns (such as v5's primary key on id, or one that covers only a prefix of the columns), or
 * when it is the primary key MySQL generated for a table created without one, which is dropped
 * with its my_row_id column. The unique (namespace, id) index that earlier v6 releases used is
 * dropped. A primary key on any other column was added by the table's owner, so it and its columns
 * are kept, and (namespace, id) gets a unique index instead.
 */
async function planKeyChanges(
	connection: mysql.PoolConnection,
	tableEsc: string,
	uniqueIndexName: string,
): Promise<string[]> {
	const [rowsResult] = await connection.query(
		mysql.format(`SHOW INDEX FROM ${tableEsc} WHERE Key_name IN ('PRIMARY', ?)`, [uniqueIndexName]),
	);
	const rows = rowsResult as mysql.RowDataPacket[];
	const primaryKeyRows = rows.filter((row) => row.Key_name === "PRIMARY");
	const uniqueIndexRows = rows.filter((row) => row.Key_name !== "PRIMARY");
	const primaryKey = readIndexColumns(primaryKeyRows);
	const uniqueIndexEsc = `\`${uniqueIndexName.replace(/`/g, "``")}\``;
	const dropUniqueIndex = uniqueIndexRows.length > 0 ? [`DROP INDEX ${uniqueIndexEsc}`] : [];
	if (isNamespaceIdIndex(primaryKey)) {
		return dropUniqueIndex;
	}

	const generated = await hasGeneratedPrimaryKey(connection, tableEsc, primaryKey);
	if (
		generated ||
		primaryKey.every((column) => column.name === "namespace" || column.name === "id")
	) {
		return [
			...(primaryKey.length > 0 || generated ? ["DROP PRIMARY KEY"] : []),
			// MySQL won't drop a generated invisible primary key without its column.
			...(generated ? ["DROP COLUMN my_row_id"] : []),
			"ADD PRIMARY KEY (namespace, id)",
			...dropUniqueIndex,
		];
	}

	if (
		isNamespaceIdIndex(readIndexColumns(uniqueIndexRows)) &&
		uniqueIndexRows.every((row) => Number(row.Non_unique) === 0)
	) {
		return [];
	}

	return [...dropUniqueIndex, `ADD UNIQUE INDEX ${uniqueIndexEsc} (namespace, id)`];
}

/** Reads an index's columns, in order, from its SHOW INDEX rows. */
function readIndexColumns(rows: mysql.RowDataPacket[]): IndexColumn[] {
	return [...rows]
		.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
		.map((row) => ({
			name: String(row.Column_name).toLowerCase(),
			prefixLength: row.Sub_part === null ? null : Number(row.Sub_part),
		}));
}

/**
 * Checks whether an index covers all of namespace and then all of id, and nothing else. An index
 * on a prefix of either column treats different keys that share the prefix as duplicates.
 */
function isNamespaceIdIndex(columns: IndexColumn[]): boolean {
	return (
		columns.length === 2 &&
		columns[0].name === "namespace" &&
		columns[1].name === "id" &&
		columns.every((column) => column.prefixLength === null)
	);
}

/**
 * Checks whether a table's primary key is the one MySQL generates for a table created without one.
 * MySQL counts a primary key as generated only when its one column is the table's first and is
 * my_row_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT INVISIBLE, so a column the table's owner added
 * with that name is not one. With show_gipk_in_create_table_and_information_schema off, MySQL
 * leaves a generated key and its column out of SHOW INDEX and SHOW COLUMNS, so when no primary key
 * is shown, a my_row_id column a query can read but SHOW COLUMNS leaves out is one.
 */
async function hasGeneratedPrimaryKey(
	connection: mysql.PoolConnection,
	tableEsc: string,
	primaryKey: IndexColumn[],
): Promise<boolean> {
	if (primaryKey.length > 1 || (primaryKey.length === 1 && primaryKey[0].name !== "my_row_id")) {
		return false;
	}

	const [columnsResult] = await connection.query(`SHOW COLUMNS FROM ${tableEsc}`);
	const columns = columnsResult as mysql.RowDataPacket[];
	if (primaryKey.length === 1) {
		const [first] = columns;
		const extra = String(first.Extra).toLowerCase().split(" ");
		return (
			String(first.Field).toLowerCase() === "my_row_id" &&
			/^bigint(\(\d+\))? unsigned$/i.test(String(first.Type)) &&
			first.Null === "NO" &&
			extra.includes("auto_increment") &&
			extra.includes("invisible")
		);
	}

	if (columns.some((column) => String(column.Field).toLowerCase() === "my_row_id")) {
		return false;
	}

	try {
		await connection.query(`SELECT my_row_id FROM ${tableEsc} LIMIT 0`);
		return true;
	} catch {
		// The table has no my_row_id column.
		return false;
	}
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

			// Make (namespace, id) unique, as the adapter does. One ALTER makes the change, so the
			// table always has a primary key.
			const indexNameValue = `${table}_key_namespace_idx`;
			const changes = await planKeyChanges(connection, tableEsc, indexNameValue);
			if (changes.length > 0) {
				try {
					await connection.query(`ALTER TABLE ${tableEsc} ${changes.join(", ")}`);
				} catch (error) {
					// An adapter connecting at the same time may have migrated the table first.
					if ((await planKeyChanges(connection, tableEsc, indexNameValue)).length > 0) {
						throw error;
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
