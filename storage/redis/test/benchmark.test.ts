import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@redis/client";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("the default benchmark network is private and its services publish no host ports", () => {
	const file = new URL("../../../scripts/docker-compose-redis-benchmark.yaml", import.meta.url);
	const stack = load(readFileSync(file, "utf8")) as {
		networks?: Record<string, { internal?: boolean; driver_opts?: Record<string, string> }>;
		services: Record<
			string,
			{
				image?: string;
				build?: { dockerfile_inline: string };
				ports?: unknown[];
				networks?: string[] | Record<string, unknown>;
				network_mode?: string;
			}
		>;
	};
	for (const [name, service] of Object.entries(stack.services)) {
		expect(service.ports ?? [], name).toEqual([]);
		expect(service.network_mode, name).toBeUndefined();
		const networks = service.networks ?? ["default"];
		for (const network of Array.isArray(networks) ? networks : Object.keys(networks)) {
			expect(stack.networks?.[network], name).toMatchObject({
				internal: true,
				driver_opts: { "com.docker.network.bridge.gateway_mode_ipv4": "isolated" },
			});
		}
		const images = service.image
			? [service.image]
			: Array.from(
					service.build?.dockerfile_inline.matchAll(/^\s*FROM\s+(\S+)/gim) ?? [],
					(match) => match[1],
				);
		expect(images.length, name).toBeGreaterThan(0);
		for (const image of images) {
			expect(image, name).toMatch(/@sha256:[a-f0-9]{64}$/);
		}
	}
});

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
