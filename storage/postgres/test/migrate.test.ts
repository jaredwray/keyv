import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { faker } from "@faker-js/faker";
import pg from "pg";
import { describe, expect, test } from "vitest";
import KeyvPostgres from "../src/index.js";

const postgresUri = "postgresql://postgres:postgres@localhost:5432/keyv_test";
const execFileAsync = promisify(execFile);
const migrateCwd = new URL("../", import.meta.url);

async function runMigrate(args: string[]): Promise<{ stdout: string; stderr: string }> {
	return execFileAsync(
		process.execPath,
		["--experimental-strip-types", "scripts/migrate-v6.ts", ...args],
		{
			cwd: migrateCwd,
			encoding: "utf8",
		},
	);
}

describe("v6 migration", () => {
	test("requires --uri", async () => {
		await expect(runMigrate([])).rejects.toMatchObject({
			stderr: expect.stringContaining("--uri is required"),
		});
	});

	test("fails when the table does not exist", async () => {
		await expect(
			runMigrate(["--uri", postgresUri, "--table", `missing_${faker.string.alphanumeric(12)}`]),
		).rejects.toMatchObject({
			stderr: expect.stringContaining("does not exist"),
		});
	});

	test("dry-run previews a legacy table without modifying its schema", async () => {
		const pool = new pg.Pool({ connectionString: postgresUri });
		const table = `keyv_dry_run_${faker.string.alphanumeric(12)}`;
		const tableEsc = `"${table}"`;

		try {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.query(
				`CREATE TABLE ${tableEsc} (key VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT)`,
			);
			const ns = faker.string.alphanumeric(8);
			const key = faker.string.alphanumeric(8);
			const value = faker.lorem.word();
			const prefixed = `${ns}:${key}`;
			await pool.query(`INSERT INTO ${tableEsc} (key, value) VALUES ($1, $2)`, [prefixed, value]);

			const schemaBefore = await pool.query(
				`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
				[table],
			);
			const { stdout } = await runMigrate(["--uri", postgresUri, "--table", table, "--dry-run"]);
			const schemaAfter = await pool.query(
				`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
				[table],
			);
			const rows = await pool.query(`SELECT key, value FROM ${tableEsc}`);

			expect(stdout).toContain(`"${prefixed}" -> key="${key}", namespace="${ns}"`);
			expect(stdout).toContain("Dry run — no changes made.");
			expect(schemaAfter.rows).toEqual(schemaBefore.rows);
			expect(rows.rows).toMatchObject([{ key: prefixed, value }]);
		} finally {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.end();
		}
	});

	test("migrates two namespaces that share the same unprefixed key", async () => {
		const pool = new pg.Pool({ connectionString: postgresUri });
		const table = `keyv_ns_${faker.string.alphanumeric(12)}`;
		const tableEsc = `"${table}"`;

		try {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.query(
				`CREATE TABLE ${tableEsc} (key VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT)`,
			);
			const nsName1 = faker.string.alphanumeric(8);
			const nsName2 = faker.string.alphanumeric(8);
			const sharedKey = faker.string.alphanumeric(8);
			const val1 = faker.lorem.word();
			const val2 = faker.lorem.word();
			await pool.query(`INSERT INTO ${tableEsc} (key, value) VALUES ($1, $2), ($3, $4)`, [
				`${nsName1}:${sharedKey}`,
				val1,
				`${nsName2}:${sharedKey}`,
				val2,
			]);

			const { stdout } = await runMigrate(["--uri", postgresUri, "--table", table]);

			expect(stdout).toContain("Migration complete. 2 row(s) updated.");
			expect(stdout).toContain("No rows need expires column population.");
			const rows = await pool.query(
				`SELECT key, value, namespace FROM ${tableEsc} ORDER BY namespace`,
			);
			expect(rows.rows).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ key: sharedKey, value: val1, namespace: nsName1 }),
					expect.objectContaining({ key: sharedKey, value: val2, namespace: nsName2 }),
				]),
			);
			expect(rows.rows).toHaveLength(2);

			const pk = await pool.query(
				`SELECT c.conname FROM pg_constraint c
				JOIN pg_class t ON c.conrelid = t.oid
				JOIN pg_namespace n ON t.relnamespace = n.oid
				WHERE n.nspname = 'public' AND t.relname = $1 AND c.contype = 'p'`,
				[table],
			);
			expect(pk.rows).toHaveLength(0);

			const indexes = await pool.query(
				`SELECT indexname FROM pg_indexes WHERE tablename = $1 ORDER BY indexname`,
				[table],
			);
			expect(indexes.rows.map((row) => row.indexname)).toEqual(
				expect.arrayContaining([`${table}_expires_idx`, `${table}_key_namespace_idx`]),
			);

			const ns1 = new KeyvPostgres({ uri: postgresUri, table });
			ns1.namespace = nsName1;
			const ns2 = new KeyvPostgres({ uri: postgresUri, table });
			ns2.namespace = nsName2;
			expect(await ns1.get(sharedKey)).toBe(val1);
			expect(await ns2.get(sharedKey)).toBe(val2);
		} finally {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.end();
		}
	});

	test("widens key and namespace columns and backfills expires from JSON", async () => {
		const pool = new pg.Pool({ connectionString: postgresUri });
		const table = `keyv_width_${faker.string.alphanumeric(12)}`;
		const tableEsc = `"${table}"`;
		const expires = Date.now() + 60_000;

		try {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.query(
				`CREATE TABLE ${tableEsc} (key VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT, namespace VARCHAR(255) DEFAULT NULL)`,
			);
			const key = faker.string.alphanumeric(10);
			const keep = faker.lorem.word();
			await pool.query(`INSERT INTO ${tableEsc} (key, value) VALUES ($1, $2)`, [
				key,
				JSON.stringify({ value: keep, expires }),
			]);

			const { stdout } = await runMigrate([
				"--uri",
				postgresUri,
				"--table",
				table,
				"--keyLength",
				"512",
				"--namespaceLength",
				"512",
			]);

			expect(stdout).toContain("No rows to migrate.");
			expect(stdout).toContain("Expires column populated for 1 row(s).");

			const columns = await pool.query(
				`SELECT column_name, character_maximum_length FROM information_schema.columns
				WHERE table_name = $1 AND column_name IN ('key', 'namespace')
				ORDER BY column_name`,
				[table],
			);
			expect(columns.rows).toMatchObject([
				{ column_name: "key", character_maximum_length: 512 },
				{ column_name: "namespace", character_maximum_length: 512 },
			]);

			const rows = await pool.query(`SELECT key, expires FROM ${tableEsc}`);
			expect(Number(rows.rows[0]?.expires)).toBe(expires);
		} finally {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.end();
		}
	});

	test("falls back to regex parsing when JSON expires backfill fails", async () => {
		const pool = new pg.Pool({ connectionString: postgresUri });
		const table = `keyv_expires_fallback_${faker.string.alphanumeric(12)}`;
		const tableEsc = `"${table}"`;

		try {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.query(
				`CREATE TABLE ${tableEsc} (key VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT)`,
			);
			const key = faker.string.alphanumeric(10);
			const expiresFallback = faker.number.int({ min: 1000, max: 99_999 });
			await pool.query(`INSERT INTO ${tableEsc} (key, value) VALUES ($1, $2)`, [
				key,
				`{not json "expires": ${expiresFallback}}`,
			]);

			const { stdout } = await runMigrate(["--uri", postgresUri, "--table", table]);

			expect(stdout).toContain("via fallback parser");
			const rows = await pool.query(`SELECT expires FROM ${tableEsc}`);
			expect(rows.rows[0]?.expires).toBe(String(expiresFallback));
		} finally {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.end();
		}
	});

	test("previews more than 20 candidate rows without rewriting on dry-run", async () => {
		const pool = new pg.Pool({ connectionString: postgresUri });
		const table = `keyv_preview_${faker.string.alphanumeric(12)}`;
		const tableEsc = `"${table}"`;

		try {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.query(
				`CREATE TABLE ${tableEsc} (key VARCHAR(255) NOT NULL PRIMARY KEY, value TEXT)`,
			);
			const ns = faker.string.alphanumeric(8);
			const values = Array.from({ length: 21 }, (_, index) => [
				`${ns}:${faker.string.alphanumeric(8)}${index}`,
				faker.lorem.word(),
			]);
			for (const [key, value] of values) {
				await pool.query(`INSERT INTO ${tableEsc} (key, value) VALUES ($1, $2)`, [key, value]);
			}

			const { stdout } = await runMigrate(["--uri", postgresUri, "--table", table, "--dry-run"]);

			expect(stdout).toContain("Found 21 row(s) to migrate:");
			expect(stdout).toContain("... and 1 more");
			const count = await pool.query(
				`SELECT COUNT(*)::int AS cnt FROM ${tableEsc} WHERE key LIKE $1`,
				["%:%"],
			);
			expect(count.rows[0]?.cnt).toBe(21);
		} finally {
			await pool.query(`DROP TABLE IF EXISTS ${tableEsc}`);
			await pool.end();
		}
	});
});
