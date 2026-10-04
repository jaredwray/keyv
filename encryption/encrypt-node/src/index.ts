import {
	type CipherCCM,
	type CipherGCM,
	createCipheriv,
	createDecipheriv,
	createHash,
	type DecipherCCM,
	type DecipherGCM,
	randomBytes,
} from "node:crypto";
import type { KeyvEncryptionAdapter } from "keyv";

/**
 * Cipher algorithms supported by {@link KeyvEncryptNode}. All of them are authenticated
 * (AEAD), so a value changed in the store fails to decrypt instead of decrypting to altered
 * data.
 */
export type NodeAlgorithm =
	| "aes-128-gcm"
	| "aes-192-gcm"
	| "aes-256-gcm"
	| "aes-128-ccm"
	| "aes-192-ccm"
	| "aes-256-ccm"
	| "chacha20-poly1305";

/**
 * Encodings for the encrypted output string. Each one turns any bytes into plain text that
 * every store keeps unchanged.
 */
export type NodeEncoding = "base64" | "base64url" | "hex";

/** Key length in bytes for each supported algorithm. */
const KEY_LENGTHS = new Map<string, number>([
	["aes-128-gcm", 16],
	["aes-192-gcm", 24],
	["aes-256-gcm", 32],
	["aes-128-ccm", 16],
	["aes-192-ccm", 24],
	["aes-256-ccm", 32],
	["chacha20-poly1305", 32],
]);

const ENCODINGS = new Set<string>(["base64", "base64url", "hex"]);

/** IV (nonce) length in bytes. Every supported algorithm uses 12. */
const IV_LENGTH = 12;

/** Authentication tag length in bytes. Set explicitly so a truncated tag is rejected. */
const AUTH_TAG_LENGTH = 16;

const CIPHER_OPTIONS = { authTagLength: AUTH_TAG_LENGTH } as Record<string, unknown>;

/**
 * Options for {@link KeyvEncryptNode}.
 */
export type KeyvEncryptNodeOptions = {
	/** Encryption key. Strings are hashed with SHA-256 and truncated to the required length. Buffers are used directly and must match the algorithm's key length. */
	key: string | Buffer;
	/** Cipher algorithm to use. Only authenticated (AEAD) algorithms are supported. @defaultValue `"aes-256-gcm"` */
	algorithm?: NodeAlgorithm;
	/** Output encoding for the encrypted string. @defaultValue `"base64"` */
	encoding?: NodeEncoding;
};

/**
 * Node.js `crypto`-based encryption adapter for Keyv.
 *
 * Encrypts and decrypts string values with an authenticated cipher from the Node.js `crypto`
 * module: AES-GCM (the default, AES-256-GCM), AES-CCM, or ChaCha20-Poly1305. The encrypted
 * output is a string (base64 by default) containing the IV, the authentication tag, and the
 * ciphertext.
 *
 * Wire format: `[IV (12 bytes) || AuthTag (16 bytes) || Ciphertext]`
 *
 * @example
 * ```ts
 * import Keyv from "keyv";
 * import KeyvEncryptNode from "@keyv/encrypt-node";
 *
 * const encryption = new KeyvEncryptNode({ key: "my-secret" });
 * const keyv = new Keyv({ encryption });
 * await keyv.set("foo", "bar");
 * ```
 */
export class KeyvEncryptNode implements KeyvEncryptionAdapter {
	private readonly _key: Buffer;
	private readonly _algorithm: NodeAlgorithm;
	private readonly _encoding: NodeEncoding;
	private readonly _isCcm: boolean;

	/**
	 * Creates a new encryption adapter.
	 * @param options - Configuration options including key, algorithm, and encoding.
	 * @throws If the algorithm is not one of the supported {@link NodeAlgorithm} values.
	 * @throws If the encoding is not one of the supported {@link NodeEncoding} values.
	 * @throws If a Buffer key does not match the expected length for the algorithm.
	 */
	constructor(options: KeyvEncryptNodeOptions) {
		const algorithm = (options.algorithm ?? "aes-256-gcm").toLowerCase();
		const keyLength = KEY_LENGTHS.get(algorithm);
		if (keyLength === undefined) {
			throw new Error(
				`Unsupported cipher algorithm: ${algorithm}. Use one of: ${[...KEY_LENGTHS.keys()].join(", ")}`,
			);
		}

		const encoding = options.encoding ?? "base64";
		if (!ENCODINGS.has(encoding)) {
			throw new Error(
				`Unsupported encoding: ${encoding}. Use one of: ${[...ENCODINGS].join(", ")}`,
			);
		}

		this._algorithm = algorithm as NodeAlgorithm;
		this._encoding = encoding;
		this._isCcm = algorithm.endsWith("-ccm");

		if (Buffer.isBuffer(options.key)) {
			if (options.key.length !== keyLength) {
				throw new Error(`Key must be ${keyLength} bytes for ${algorithm}`);
			}

			this._key = options.key;
		} else {
			const hash = createHash("sha256").update(options.key).digest();
			this._key = hash.subarray(0, keyLength);
		}
	}

	/**
	 * Encrypts a plaintext string.
	 * @param data - The plaintext string to encrypt.
	 * @returns The encrypted string encoded with the configured encoding.
	 */
	encrypt(data: string): string {
		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv(
			this._algorithm,
			this._key,
			iv,
			CIPHER_OPTIONS,
		) as unknown as CipherGCM;

		if (this._isCcm) {
			const plaintextLength = Buffer.byteLength(data, "utf8");
			(cipher as unknown as CipherCCM).setAAD(Buffer.alloc(0), { plaintextLength });
		}

		const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
		const packed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
		return packed.toString(this._encoding);
	}

	/**
	 * Decrypts an encrypted string back to its original plaintext.
	 * @param data - The encrypted string to decrypt.
	 * @returns The original plaintext string.
	 * @throws If the ciphertext or its authentication tag has been changed or truncated.
	 * @throws If the wrong key is used for decryption.
	 */
	decrypt(data: string): string {
		const packed = Buffer.from(data, this._encoding);
		const iv = packed.subarray(0, IV_LENGTH);
		const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
		const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
		const decipher = createDecipheriv(
			this._algorithm,
			this._key,
			iv,
			CIPHER_OPTIONS,
		) as unknown as DecipherGCM;
		decipher.setAuthTag(authTag);

		if (this._isCcm) {
			(decipher as unknown as DecipherCCM).setAAD(Buffer.alloc(0), {
				plaintextLength: encrypted.length,
			});
		}

		const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
		return decrypted.toString("utf8");
	}
}

export default KeyvEncryptNode;
