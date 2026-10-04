import type { KeyvEncryptionAdapter } from "keyv";

/** Length of the GCM authentication tag in bytes. */
const AUTH_TAG_LENGTH = 16;

/** Length of the GCM initialization vector (IV) in bytes. */
const IV_LENGTH = 12;

/**
 * Supported cipher algorithms for the Web Crypto API adapter. All of them are AES-GCM, which is
 * authenticated (AEAD), so a value changed in the store fails to decrypt instead of decrypting
 * to altered data.
 */
export type WebAlgorithm = "aes-128-gcm" | "aes-192-gcm" | "aes-256-gcm";

/**
 * Options for {@link KeyvEncryptWeb}.
 */
export type KeyvEncryptWebOptions = {
	/** Encryption key. Strings are hashed once with SHA-256 (no salt or key stretching) and truncated to the required length, so use a random secret, not a password. Uint8Array keys are used directly and must match the algorithm's key length. */
	key: string | Uint8Array<ArrayBuffer>;
	/** Algorithm. @defaultValue `"aes-256-gcm"` */
	algorithm?: WebAlgorithm;
};

/** Key length in bytes for each supported algorithm. */
const KEY_LENGTHS = new Map<string, number>([
	["aes-128-gcm", 16],
	["aes-192-gcm", 24],
	["aes-256-gcm", 32],
]);

/** Encodes a Uint8Array to a base64 string using chunked `String.fromCharCode` to avoid call-stack limits. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	const chunkSize = 0x8000;
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i += chunkSize) {
		parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
	}

	return btoa(parts.join(""));
}

/** Decodes a base64 string to a Uint8Array backed by an ArrayBuffer. */
function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}

/** Concatenates multiple Uint8Array instances into a single ArrayBuffer-backed Uint8Array. */
function concat(...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
	let totalLength = 0;
	for (const array of arrays) {
		totalLength += array.length;
	}

	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const array of arrays) {
		result.set(array, offset);
		offset += array.length;
	}

	return result;
}

/**
 * Web Crypto API encryption adapter for Keyv.
 *
 * Encrypts and decrypts string values using the Web Crypto API
 * (`crypto.subtle`). Works in browsers, Deno, Cloudflare Workers, and
 * Node.js 18+. Uses AES-GCM, which is authenticated, and defaults to AES-256-GCM.
 *
 * Wire format: `[IV (12 bytes) || AuthTag (16 bytes) || Ciphertext]`
 *
 * @example
 * ```ts
 * import Keyv from "keyv";
 * import KeyvEncryptWeb from "@keyv/encrypt-web";
 *
 * const encryption = new KeyvEncryptWeb({ key: "my-secret" });
 * const keyv = new Keyv({ encryption });
 * await keyv.set("foo", "bar");
 * ```
 */
export class KeyvEncryptWeb implements KeyvEncryptionAdapter {
	private readonly _keyPromise: Promise<CryptoKey>;

	/**
	 * Creates a new encryption adapter.
	 * @param options - Configuration options including key and algorithm.
	 * @throws If the algorithm is not supported.
	 * @throws If a Uint8Array key does not match the expected length for the algorithm.
	 */
	constructor(options: KeyvEncryptWebOptions) {
		const algorithm = (options.algorithm ?? "aes-256-gcm").toLowerCase();
		const keyLength = KEY_LENGTHS.get(algorithm);
		if (keyLength === undefined) {
			throw new Error(
				`Unsupported cipher algorithm: ${algorithm}. Use one of: ${[...KEY_LENGTHS.keys()].join(", ")}`,
			);
		}

		if (options.key instanceof Uint8Array) {
			if (options.key.length !== keyLength) {
				throw new Error(`Key must be ${keyLength} bytes for ${algorithm}`);
			}

			this._keyPromise = crypto.subtle.importKey(
				"raw",
				options.key.slice(),
				{ name: "AES-GCM" },
				false,
				["encrypt", "decrypt"],
			);
		} else {
			const encoded = new TextEncoder().encode(options.key);
			this._keyPromise = crypto.subtle.digest("SHA-256", encoded).then((hash) => {
				const keyBytes = new Uint8Array(hash).slice(0, keyLength);
				return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
					"encrypt",
					"decrypt",
				]);
			});
		}
	}

	/**
	 * Encrypts a plaintext string.
	 * @param data - The plaintext string to encrypt.
	 * @returns The encrypted string encoded as base64.
	 */
	async encrypt(data: string): Promise<string> {
		const cryptoKey = await this._keyPromise;
		const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
		const encoded = new TextEncoder().encode(data);
		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
			cryptoKey,
			encoded,
		);

		// Web Crypto returns [ciphertext || authTag], rearrange to [IV || authTag || ciphertext]
		const combined = new Uint8Array(ciphertext);
		const actualCiphertext = combined.slice(0, combined.length - AUTH_TAG_LENGTH);
		const authTag = combined.slice(combined.length - AUTH_TAG_LENGTH);
		const packed = concat(iv, authTag, actualCiphertext);
		return uint8ArrayToBase64(packed);
	}

	/**
	 * Decrypts an encrypted string back to its original plaintext.
	 * @param data - The encrypted base64 string to decrypt.
	 * @returns The original plaintext string.
	 * @throws If the ciphertext has been changed or truncated.
	 * @throws If the wrong key is used for decryption.
	 */
	async decrypt(data: string): Promise<string> {
		const cryptoKey = await this._keyPromise;
		const packed = base64ToUint8Array(data);
		const iv = packed.slice(0, IV_LENGTH);
		const authTag = packed.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
		const ciphertext = packed.slice(IV_LENGTH + AUTH_TAG_LENGTH);

		// Reassemble for Web Crypto: [ciphertext || authTag]
		const webCombined = concat(ciphertext, authTag);
		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
			cryptoKey,
			webCombined,
		);

		return new TextDecoder().decode(decrypted);
	}
}

export default KeyvEncryptWeb;
