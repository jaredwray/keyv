import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Simple AES-256-GCM encryption adapter used internally for testing the encryption test suite.
 */
export class KeyvAes256TestAdapter {
	private readonly _key: Buffer;

	constructor(secret: string) {
		this._key = createHash("sha256").update(secret).digest();
	}

	/** Encrypts a string value using AES-256-GCM and returns a base64-encoded result. */
	encrypt(data: string): string {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this._key, iv);
		const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([iv, tag, encrypted]).toString("base64");
	}

	/** Decrypts a base64-encoded AES-256-GCM string back to its original value. */
	decrypt(data: string): string {
		const buffer = Buffer.from(data, "base64");
		const iv = buffer.subarray(0, 12);
		const tag = buffer.subarray(12, 28);
		const encrypted = buffer.subarray(28);
		const decipher = createDecipheriv("aes-256-gcm", this._key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
	}
}
