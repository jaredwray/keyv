import { once } from "node:events";
import { type MessagePort, parentPort, workerData } from "node:worker_threads";
import KeyvRedis from "@keyv/redis";

const keyCount = 200_000;
export const threadCount = 4;
const ttl = 10 * 60_000;

export function openStore(uri: string, namespace: string) {
	return new KeyvRedis<string>(
		{ url: uri, socket: { reconnectStrategy: false }, commandOptions: { timeout: 5000 } },
		{ namespace, throwOnErrors: true, connectionTimeout: 5000 },
	);
}

function valueFor(id: number, version: number): string {
	return `${id}/${version}`.padEnd(1024, ".");
}

export async function preload(store: KeyvRedis<string>): Promise<void> {
	const batchSize = 500;
	for (let start = 0; start < keyCount; start += batchSize) {
		const expires = Date.now() + ttl;
		const entries = Array.from({ length: batchSize }, (_, i) => ({
			key: String(start + i),
			value: valueFor(start + i, 0),
			expires,
		}));
		const replies = await store.setMany(entries);
		if (replies.length !== entries.length || !replies.every(Boolean)) {
			throw new Error("The server rejected the preload.");
		}
	}
}

async function measure(
	store: KeyvRedis<string>,
	client: number,
	connections: number,
	deadline: number,
) {
	// Each connection owns a key range so it can verify each reply during concurrent writes.
	const first = Math.floor((client * keyCount) / connections);
	const count = Math.floor(((client + 1) * keyCount) / connections) - first;
	const versions = new Uint32Array(count);
	const randomOffset = () => Math.floor(Math.random() * count);
	let writes = 0;

	while (performance.now() < deadline) {
		const offset = randomOffset();
		const id = first + offset;
		const value = valueFor(id, ++versions[offset]);
		if (!(await store.set(String(id), value, Date.now() + ttl))) {
			throw new Error("The server rejected a write.");
		}
		// The first of nine reads checks the value that this connection just wrote.
		for (let read = 0; read < 9; read++) {
			const target = read === 0 ? offset : randomOffset();
			const expected = read === 0 ? value : valueFor(first + target, versions[target]);
			if ((await store.get(String(first + target))) !== expected) {
				throw new Error("The server returned an unexpected value.");
			}
		}
		writes++;
	}
	if (writes === 0) {
		throw new Error("A connection did not complete the workload.");
	}
	return writes;
}

type WorkerOptions = { uri: string; namespace: string; connections: number; thread: number };

async function runWorker(
	port: MessagePort,
	{ uri, namespace, connections, thread }: WorkerOptions,
) {
	const clients = Array.from({ length: connections / threadCount }, () =>
		openStore(uri, namespace),
	);
	try {
		await Promise.all(
			clients.map(async (store, i) => {
				const client = thread * clients.length + i;
				const id = Math.floor((client * keyCount) / connections);
				// Check a preloaded key and warm up expiry detection before the timed run.
				if (
					(await store.get(String(id))) !== valueFor(id, 0) ||
					!(await store.set(String(id), valueFor(id, 0), Date.now() + ttl))
				) {
					throw new Error("The server did not pass the warm-up check.");
				}
			}),
		);
		const start = once(port, "message");
		port.postMessage("ready");
		const [deadline] = await start;
		const writes = await Promise.all(
			clients.map((store, i) => measure(store, thread * clients.length + i, connections, deadline)),
		);
		return { writes: writes.reduce((total, count) => total + count, 0), end: performance.now() };
	} finally {
		await Promise.all(clients.map((store) => store.disconnect(true)));
	}
}

if (parentPort) {
	parentPort.postMessage(await runWorker(parentPort, workerData));
}
