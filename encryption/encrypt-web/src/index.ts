import type { KeyvEncryptionAdapter } from "keyv";

const AUTH_TAG_LENGTH = 16;

export type WebAlgorithm =
	| "aes-128-gcm"
	| "aes-192-gcm"
	| "aes-256-gcm"
	| "aes-128-cbc"
	| "aes-192-cbc"
	| "aes-256-cbc";

export type KeyvEncryptWebOptions = {
	/** Encryption key. Strings are hashed with SHA-256 to derive the required key length. Uint8Array used directly. */
	key: string | Uint8Array;
	/** Algorithm. Default: "aes-256-gcm". */
	algorithm?: WebAlgorithm;
};

type AlgorithmConfig = {
	webCryptoName: "AES-GCM" | "AES-CBC";
	keyLength: number;
	ivLength: number;
	isAead: boolean;
};

const ALGORITHM_MAP: Record<WebAlgorithm, AlgorithmConfig> = {
	"aes-128-gcm": { webCryptoName: "AES-GCM", keyLength: 16, ivLength: 12, isAead: true },
	"aes-192-gcm": { webCryptoName: "AES-GCM", keyLength: 24, ivLength: 12, isAead: true },
	"aes-256-gcm": { webCryptoName: "AES-GCM", keyLength: 32, ivLength: 12, isAead: true },
	"aes-128-cbc": { webCryptoName: "AES-CBC", keyLength: 16, ivLength: 16, isAead: false },
	"aes-192-cbc": { webCryptoName: "AES-CBC", keyLength: 24, ivLength: 16, isAead: false },
	"aes-256-cbc": { webCryptoName: "AES-CBC", keyLength: 32, ivLength: 16, isAead: false },
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
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

export class KeyvEncryptWeb implements KeyvEncryptionAdapter {
	private readonly _config: AlgorithmConfig;
	private readonly _keyPromise: Promise<CryptoKey>;

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
