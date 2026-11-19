import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@redis/client";
import { expect, test } from "vitest";

test("the benchmark rejects a read-only account and omits its credentials from the report", async () => {
	const url = new URL(process.env.REDIS_URI ?? "redis://localhost:6379");
	const admin = createClient({ url: url.href });
	const user = `benchmark-${randomUUID()}`;
	const password = randomUUID();
	await admin.connect();
	try {
		await admin.aclSetUser(user, ["on", `>${password}`, "~keyv-bench*", "+@read", "+@connection"]);
		url.username = user;
		url.password = password;
		const script = fileURLToPath(new URL("../benchmark/combined.ts", import.meta.url));
		const result = spawnSync(process.execPath, ["--import", "tsx", script], {
			encoding: "utf8",
			env: { ...process.env, REDIS_URI: url.href, VALKEY_URI: url.href, KIVIDB_URI: url.href },
			timeout: 20_000,
		});
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("preload");
		const output = result.stdout + result.stderr;
		expect(output).not.toContain(user);
		expect(output).not.toContain(password);
	} finally {
		try {
			await admin.aclDelUser(user);
		} finally {
			await admin.close();
		}
	}
}, 30_000);
