import type { KeyvEncryptionAdapter } from "keyv";

/** Length of the GCM authentication tag in bytes. */
const AUTH_TAG_LENGTH = 16;

/**
 * Supported cipher algorithms for the Web Crypto API adapter.
 */
export type WebAlgorithm =
	| "aes-128-gcm"
	| "aes-192-gcm"
	| "aes-256-gcm"
	| "aes-128-cbc"
	| "aes-192-cbc"
	| "aes-256-cbc";

/**
 * Options for {@link KeyvEncryptWeb}.
 */
export type KeyvEncryptWebOptions = {
	/** Encryption key. Strings are hashed with SHA-256 and truncated to the required length. Uint8Array keys are used directly and must match the algorithm's key length. */
	key: string | Uint8Array<ArrayBuffer>;
	/** Algorithm. @defaultValue `"aes-256-gcm"` */
	algorithm?: WebAlgorithm;
};

/** Internal configuration derived from a {@link WebAlgorithm} value. */
type AlgorithmConfig = {
	/** The Web Crypto API algorithm name. */
	webCryptoName: "AES-GCM" | "AES-CBC";
	/** Required key length in bytes. */
	keyLength: number;
	/** Required initialization vector (IV) length in bytes. The IV is a random value generated for each encryption operation to ensure identical plaintexts produce different ciphertexts. GCM uses 12 bytes, CBC uses 16 bytes. */
	ivLength: number;
	/** Whether the algorithm provides Authenticated Encryption with Associated Data (AEAD). AEAD algorithms like AES-GCM include a built-in authentication tag that detects tampering or corruption of the ciphertext. Non-AEAD algorithms like AES-CBC encrypt data but do not verify its integrity. */
	isAead: boolean;
};

/** Maps each supported algorithm string to its Web Crypto configuration. */
const ALGORITHM_MAP: Record<WebAlgorithm, AlgorithmConfig> = {
	"aes-128-gcm": { webCryptoName: "AES-GCM", keyLength: 16, ivLength: 12, isAead: true },
	"aes-192-gcm": { webCryptoName: "AES-GCM", keyLength: 24, ivLength: 12, isAead: true },
	"aes-256-gcm": { webCryptoName: "AES-GCM", keyLength: 32, ivLength: 12, isAead: true },
	"aes-128-cbc": { webCryptoName: "AES-CBC", keyLength: 16, ivLength: 16, isAead: false },
	"aes-192-cbc": { webCryptoName: "AES-CBC", keyLength: 24, ivLength: 16, isAead: false },
	"aes-256-cbc": { webCryptoName: "AES-CBC", keyLength: 32, ivLength: 16, isAead: false },
};

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
 * Node.js 18+. Defaults to AES-256-GCM with authenticated encryption.
 *
 * The encrypted output uses the same wire format as `@keyv/encrypt-node`,
 * enabling cross-compatibility between the two packages.
 *
 * Wire format (AEAD): `[IV (12 bytes) || AuthTag (16 bytes) || Ciphertext]`
 * Wire format (non-AEAD): `[IV (16 bytes) || Ciphertext]`
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
	private readonly _config: AlgorithmConfig;
	private readonly _keyPromise: Promise<CryptoKey>;

	/**
	 * Creates a new encryption adapter.
	 * @param options - Configuration options including key and algorithm.
	 * @throws If the algorithm is not supported.
	 * @throws If a Uint8Array key does not match the expected length for the algorithm.
	 */
	constructor(options: KeyvEncryptWebOptions) {
		const algorithm = (options.algorithm ?? "aes-256-gcm").toLowerCase() as WebAlgorithm;
		const config = ALGORITHM_MAP[algorithm];
		if (!config) {
			throw new Error(`Unsupported cipher algorithm: ${algorithm}`);
		}

		this._config = config;

		if (options.key instanceof Uint8Array) {
			if (options.key.length !== config.keyLength) {
				throw new Error(`Key must be ${config.keyLength} bytes for ${algorithm}`);
			}

			this._keyPromise = crypto.subtle.importKey(
				"raw",
				options.key.slice(),
				{ name: config.webCryptoName },
				false,
				["encrypt", "decrypt"],
			);
		} else {
			const encoded = new TextEncoder().encode(options.key);
			this._keyPromise = crypto.subtle.digest("SHA-256", encoded).then((hash) => {
				const keyBytes = new Uint8Array(hash).slice(0, config.keyLength);
				return crypto.subtle.importKey("raw", keyBytes, { name: config.webCryptoName }, false, [
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
		const iv = crypto.getRandomValues(new Uint8Array(this._config.ivLength));
		const encoded = new TextEncoder().encode(data);

		if (this._config.isAead) {
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

		const ciphertext = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, cryptoKey, encoded);

		const packed = concat(iv, new Uint8Array(ciphertext));
		return uint8ArrayToBase64(packed);
	}

	/**
	 * Decrypts an encrypted string back to its original plaintext.
	 * @param data - The encrypted base64 string to decrypt.
	 * @returns The original plaintext string.
	 * @throws If the ciphertext has been tampered with (AEAD modes).
	 * @throws If the wrong key is used for decryption.
	 */
	async decrypt(data: string): Promise<string> {
		const cryptoKey = await this._keyPromise;
		const packed = base64ToUint8Array(data);

		if (this._config.isAead) {
			const iv = packed.slice(0, this._config.ivLength);
			const authTag = packed.slice(this._config.ivLength, this._config.ivLength + AUTH_TAG_LENGTH);
			const ciphertext = packed.slice(this._config.ivLength + AUTH_TAG_LENGTH);

			// Reassemble for Web Crypto: [ciphertext || authTag]
			const webCombined = concat(ciphertext, authTag);
			const decrypted = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv, tagLength: AUTH_TAG_LENGTH * 8 },
				cryptoKey,
				webCombined,
			);

			return new TextDecoder().decode(decrypted);
		}

		const iv = packed.slice(0, this._config.ivLength);
		const ciphertext = packed.slice(this._config.ivLength);
		const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, ciphertext);

		return new TextDecoder().decode(decrypted);
	}
}

export default KeyvEncryptWeb;
