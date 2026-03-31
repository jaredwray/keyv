import {
	type CipherGCM,
	createCipheriv,
	createDecipheriv,
	createHash,
	type DecipherGCM,
	getCipherInfo,
	randomBytes,
} from "node:crypto";
import type { KeyvEncryptionAdapter } from "keyv";

const AEAD_MODES = new Set(["gcm", "ccm", "stream"]);
const CCM_MODES = new Set(["ccm"]);

const AUTH_TAG_LENGTH = 16;

/**
 * Options for {@link KeyvEncryptNode}.
 */
export type KeyvEncryptNodeOptions = {
	/** Encryption key. Strings are hashed with SHA-256 and truncated to the required length. Buffers are used directly and must match the algorithm's key length. */
	key: string | Buffer;
	/** Cipher algorithm to use. Any algorithm supported by Node.js `crypto.getCipherInfo()`. @defaultValue `"aes-256-gcm"` */
	algorithm?: string;
	/** Output encoding for the encrypted string. @defaultValue `"base64"` */
	encoding?: BufferEncoding;
};

/**
 * Node.js `crypto`-based encryption adapter for Keyv.
 *
 * Encrypts and decrypts string values using any cipher supported by the
 * Node.js `crypto` module. Defaults to AES-256-GCM with authenticated
 * encryption. The encrypted output is a base64 string containing the IV,
 * authentication tag (for AEAD ciphers), and ciphertext.
 *
 * Wire format (AEAD): `[IV || AuthTag (16 bytes) || Ciphertext]`
 * Wire format (non-AEAD): `[IV || Ciphertext]`
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
	private readonly _algorithm: string;
	private readonly _encoding: BufferEncoding;
	private readonly _ivLength: number;
	private readonly _isAead: boolean;
	private readonly _isCcm: boolean;

	/**
	 * Creates a new encryption adapter.
	 * @param options - Configuration options including key, algorithm, and encoding.
	 * @throws If the algorithm is not supported by Node.js crypto.
	 * @throws If a Buffer key does not match the expected length for the algorithm.
	 */
	constructor(options: KeyvEncryptNodeOptions) {
		this._algorithm = (options.algorithm ?? "aes-256-gcm").toLowerCase();
		this._encoding = options.encoding ?? "base64";

		const info = getCipherInfo(this._algorithm);
		if (!info) {
			throw new Error(`Unsupported cipher algorithm: ${this._algorithm}`);
		}

		const mode = info.mode ?? "";
		this._ivLength = info.ivLength ?? 12;
		this._isAead = AEAD_MODES.has(mode);
		this._isCcm = CCM_MODES.has(mode);

		if (Buffer.isBuffer(options.key)) {
			if (options.key.length !== info.keyLength) {
				throw new Error(`Key must be ${info.keyLength} bytes for ${this._algorithm}`);
			}

			this._key = options.key;
		} else {
			const hash = createHash("sha256").update(options.key).digest();
			this._key = hash.subarray(0, info.keyLength);
		}
	}

	/**
	 * Encrypts a plaintext string.
	 * @param data - The plaintext string to encrypt.
	 * @returns The encrypted string encoded with the configured encoding.
	 */
	encrypt(data: string): string {
		const iv = randomBytes(this._ivLength);
		const cipherOptions = this._isCcm
			? ({ authTagLength: AUTH_TAG_LENGTH } as Record<string, unknown>)
			: undefined;
		const cipher = createCipheriv(this._algorithm, this._key, iv, cipherOptions);

		if (this._isCcm) {
			const plaintextLength = Buffer.byteLength(data, "utf8");
			(cipher as unknown as CipherGCM).setAAD(Buffer.alloc(0), { plaintextLength });
		}

		const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);

		if (this._isAead) {
			const authTag = (cipher as unknown as CipherGCM).getAuthTag();
			const packed = Buffer.concat([iv, authTag, encrypted]);
			return packed.toString(this._encoding);
		}

		const packed = Buffer.concat([iv, encrypted]);
		return packed.toString(this._encoding);
	}

	/**
	 * Decrypts an encrypted string back to its original plaintext.
	 * @param data - The encrypted string to decrypt.
	 * @returns The original plaintext string.
	 * @throws If the ciphertext has been tampered with (AEAD modes).
	 * @throws If the wrong key is used for decryption.
	 */
	decrypt(data: string): string {
		const packed = Buffer.from(data, this._encoding);

		if (this._isAead) {
			const iv = packed.subarray(0, this._ivLength);
			const authTag = packed.subarray(this._ivLength, this._ivLength + AUTH_TAG_LENGTH);
			const encrypted = packed.subarray(this._ivLength + AUTH_TAG_LENGTH);
			const decipherOptions = this._isCcm
				? ({ authTagLength: AUTH_TAG_LENGTH } as Record<string, unknown>)
				: undefined;
			const decipher = createDecipheriv(this._algorithm, this._key, iv, decipherOptions);
			(decipher as unknown as DecipherGCM).setAuthTag(authTag);

			if (this._isCcm) {
				(decipher as unknown as DecipherGCM).setAAD(Buffer.alloc(0), {
					plaintextLength: encrypted.length,
				});
			}

			const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
			return decrypted.toString("utf8");
		}

		const iv = packed.subarray(0, this._ivLength);
		const encrypted = packed.subarray(this._ivLength);
		const decipher = createDecipheriv(this._algorithm, this._key, iv);
		const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
		return decrypted.toString("utf8");
	}
}

export default KeyvEncryptNode;
