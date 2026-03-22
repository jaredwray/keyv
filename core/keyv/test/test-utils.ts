import type {
	KeyvCompressionAdapter,
	KeyvStorageAdapter,
} from "../src/index.js";

export const delay = async (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

// Mock compression adapter for testing compression code paths
export const createMockCompression = (): KeyvCompressionAdapter => ({
	async compress(value: unknown) {
		return value;
	},
	async decompress(value: unknown) {
		return value;
	},
});

// In-memory store adapter with getMany, iterator, disconnect, and namespace support
export const createStore = () => {
	const map = new Map<string, unknown>();
	const store = {
		opts: { dialect: "sqlite", url: "" },
		namespace: undefined as string | undefined,
		async get(key: string) {
			return map.get(key);
		},
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		async set(key: string, value: any, _ttl?: number) {
			map.set(key, value);
		},
		async delete(key: string) {
			return map.delete(key);
		},
		async clear() {
			map.clear();
		},
		async getMany(keys: string[]) {
			return keys.map((key) => map.get(key));
		},
		async has(key: string) {
			return map.has(key);
		},
		async disconnect() {},
		async *iterator(namespace?: string) {
			for (const [key, value] of map) {
				if (!namespace || key.startsWith(namespace)) {
					yield [key, value];
				}
			}
		},
		on() {
			return store;
		},
	} as unknown as KeyvStorageAdapter;
	return store;
};
