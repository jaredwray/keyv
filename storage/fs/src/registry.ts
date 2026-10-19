import { realpathSync } from "node:fs";
import path from "node:path";
import type { Strategy } from "./strategies/strategy.js";

type Registration = { backend: Strategy; refs: number; fingerprint: string };
type RegistryState = {
	registrations: Map<string, Registration>;
	closing: Map<string, Promise<void>>;
};

// Kept on globalThis, so the CommonJS and ES module builds share it when both are loaded.
const REGISTRY = Symbol.for("@keyv/fs/registry");

function state(): RegistryState {
	const holder = globalThis as typeof globalThis & { [REGISTRY]?: RegistryState };
	holder[REGISTRY] ??= { registrations: new Map(), closing: new Map() };
	return holder[REGISTRY];
}

/**
 * The key that identifies a store path in this process: its real absolute path, with symbolic
 * links resolved, so two spellings of one path share a backend. For a path that doesn't exist
 * yet, its nearest existing ancestor is resolved and the rest is appended.
 * @param storePath - The store file or directory.
 */
export function registryKey(storePath: string): string {
	const absolute = path.resolve(storePath);
	const missing: string[] = [];
	for (let existing = absolute; ; existing = path.dirname(existing)) {
		try {
			return path.join(realpathSync.native(existing), ...missing);
		} catch {
			if (path.dirname(existing) === existing) {
				return absolute;
			}

			missing.unshift(path.basename(existing));
		}
	}
}

/**
 * Attaches to the backend for a path, creating it on first use. Every {@link KeyvFs} on the
 * same path in this process shares one backend, so they never overwrite each other.
 * @param key - From {@link registryKey}.
 * @param fingerprint - The options the backend depends on. They must match an existing backend.
 * @param create - Creates the backend. It receives the close of an earlier backend on the same
 * path, if one is still closing, for its load to wait for.
 * @throws {Error} If the path is already open with different options.
 */
export function attach(
	key: string,
	fingerprint: string,
	create: (previousClose?: Promise<void>) => Strategy,
): Strategy {
	const { registrations, closing } = state();
	const existing = registrations.get(key);
	if (existing) {
		if (existing.fingerprint !== fingerprint) {
			throw new Error(
				`@keyv/fs: ${key} is already open in this process with different options (${existing.fingerprint}). Every KeyvFs on one path must use the same strategy, writeDelay, and expiredCheckDelay.`,
			);
		}

		existing.refs++;
		return existing.backend;
	}

	const backend = create(closing.get(key));
	registrations.set(key, { backend, refs: 1, fingerprint });
	return backend;
}

/**
 * Releases one attachment. The last release closes the backend: it saves pending writes and
 * releases its resources.
 * @param key - From {@link registryKey}.
 * @param backend - The backend that was attached.
 * @returns The close, when this was the last attachment.
 */
export function detach(key: string, backend: Strategy): Promise<void> {
	const { registrations, closing } = state();
	const registration = registrations.get(key);
	if (registration === undefined || registration.backend !== backend) {
		return Promise.resolve();
	}

	registration.refs--;
	if (registration.refs > 0) {
		return Promise.resolve();
	}

	registrations.delete(key);
	const closed = backend.close();
	closing.set(key, closed);
	const forget = () => {
		if (closing.get(key) === closed) {
			closing.delete(key);
		}
	};
	closed.then(forget, forget);
	return closed;
}
