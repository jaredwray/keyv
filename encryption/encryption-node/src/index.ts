import {
	type CipherGCM,
	createCipheriv,
	createDecipheriv,
	createHash,
	type DecipherGCM,
	getCiphers,
	randomBytes,
} from "node:crypto";
import type { KeyvEncryptionAdapter } from "keyv";

const AEAD_ALGORITHMS = new Set([
	"aes-128-gcm",
	"aes-192-gcm",
	"aes-256-gcm",
	"aes-128-ccm",
	"aes-192-ccm",
	"aes-256-ccm",
	"chacha20-poly1305",
]);

const AUTH_TAG_LENGTH = 16;

export type KeyvEncryptionNodeOptions = {
	/** Encryption key. Strings are hashed with SHA-256 to derive a 32-byte key. Buffers are used directly. */
	key: string | Buffer;
	/** Cipher algorithm to use. Default: "aes-256-gcm". */
	algorithm?: string;
	/** Output encoding for the encrypted string. Default: "base64". */
	encoding?: BufferEncoding;
};

function getIvLength(algorithm: string): number {
	if (algorithm.includes("gcm") || algorithm === "chacha20-poly1305") {
		return 12;
	}

	return 16;
}

function getKeyLength(algorithm: string): number {
	if (algorithm.includes("128")) {
		return 16;
	}

	if (algorithm.includes("192")) {
		return 24;
	}

	return 32;
}

export class KeyvEncryptionNode implements KeyvEncryptionAdapter {
	private readonly _key: Buffer;
	private readonly _algorithm: string;
	private readonly _encoding: BufferEncoding;
	private readonly _ivLength: number;
	private readonly _isAead: boolean;

	constructor(options: KeyvEncryptionNodeOptions) {
		this._algorithm = options.algorithm ?? "aes-256-gcm";
		this._encoding = options.encoding ?? "base64";
		this._ivLength = getIvLength(this._algorithm);
		this._isAead = AEAD_ALGORITHMS.has(this._algorithm);

		if (Buffer.isBuffer(options.key)) {
			const expectedLength = getKeyLength(this._algorithm);
			if (options.key.length !== expectedLength) {
				throw new Error(`Key must be ${expectedLength} bytes for ${this._algorithm}`);
			}

			this._key = options.key;
		} else {
			const hash = createHash("sha256").update(options.key).digest();
			const expectedLength = getKeyLength(this._algorithm);
			this._key = hash.subarray(0, expectedLength);
		}

		if (!getCiphers().includes(this._algorithm)) {
			throw new Error(`Unsupported cipher algorithm: ${this._algorithm}`);
		}
	}

	encrypt(data: string): string {
		const iv = randomBytes(this._ivLength);
		const cipher = createCipheriv(this._algorithm, this._key, iv);
		const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);

		if (this._isAead) {
			const authTag = (cipher as unknown as CipherGCM).getAuthTag();
			const packed = Buffer.concat([iv, authTag, encrypted]);
			return packed.toString(this._encoding);
		}

		const packed = Buffer.concat([iv, encrypted]);
		return packed.toString(this._encoding);
	}

	decrypt(data: string): string {
		const packed = Buffer.from(data, this._encoding);

		if (this._isAead) {
			const iv = packed.subarray(0, this._ivLength);
			const authTag = packed.subarray(this._ivLength, this._ivLength + AUTH_TAG_LENGTH);
			const encrypted = packed.subarray(this._ivLength + AUTH_TAG_LENGTH);
			const decipher = createDecipheriv(this._algorithm, this._key, iv);
			(decipher as unknown as DecipherGCM).setAuthTag(authTag);
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

export default KeyvEncryptionNode;
