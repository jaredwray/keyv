import { randomBytes } from "node:crypto";
import { Keyv } from "keyv";
import { describe, expect, it } from "vitest";
import KeyvEncryptNode from "../src/index.js";

describe("KeyvEncryptNode", () => {
	const secret = "my-secret-key";

	describe("default aes-256-gcm", () => {
		it("should encrypt and decrypt a string", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const data = "hello world";
			const encrypted = encryption.encrypt(data);
			expect(encrypted).not.toBe(data);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});

		it("should produce different ciphertext each time due to random IV", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const data = "same input";
			const encrypted1 = encryption.encrypt(data);
			const encrypted2 = encryption.encrypt(data);
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("should throw on tampered ciphertext", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const encrypted = encryption.encrypt("test data");
			const buffer = Buffer.from(encrypted, "base64");
			buffer[buffer.length - 1] ^= 0xff;
			const tampered = buffer.toString("base64");
			expect(() => encryption.decrypt(tampered)).toThrow();
		});

		it("should fail to decrypt with a different key", () => {
			const encryption1 = new KeyvEncryptNode({ key: "key-one" });
			const encryption2 = new KeyvEncryptNode({ key: "key-two" });
			const encrypted = encryption1.encrypt("secret data");
			expect(() => encryption2.decrypt(encrypted)).toThrow();
		});

		it("should handle unicode and emoji content", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const data = "Hello 🌍 日本語 العربية émojis";
			const encrypted = encryption.encrypt(data);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});

		it("should handle empty string", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const encrypted = encryption.encrypt("");
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe("");
		});

		it("should handle large data", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const data = "x".repeat(100_000);
			const encrypted = encryption.encrypt(data);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});
	});

	describe("key handling", () => {
		it("should accept a string key and derive via SHA-256", () => {
			const encryption = new KeyvEncryptNode({ key: "any-length-string-works" });
			const data = "test";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should accept a 32-byte Buffer key", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey });
			const data = "test with buffer key";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw if Buffer key has wrong length for aes-256-gcm", () => {
			const badKey = randomBytes(16);
			expect(() => new KeyvEncryptNode({ key: badKey })).toThrow("Key must be 32 bytes");
		});
	});

	describe("custom algorithms", () => {
		it("should work with aes-128-gcm", () => {
			const bufferKey = randomBytes(16);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "aes-128-gcm" });
			const data = "aes-128-gcm test";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-128-gcm using string key", () => {
			const encryption = new KeyvEncryptNode({ key: "my-key", algorithm: "aes-128-gcm" });
			const data = "aes-128-gcm string key test";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with chacha20-poly1305", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "chacha20-poly1305" });
			const data = "chacha20 test";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-256-cbc (non-AEAD)", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "aes-256-cbc" });
			const data = "cbc mode test";
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw for unsupported algorithm", () => {
			expect(() => new KeyvEncryptNode({ key: "test", algorithm: "invalid-algorithm" })).toThrow(
				"Unsupported cipher algorithm",
			);
		});
	});

	describe("encoding option", () => {
		it("should support hex encoding", () => {
			const encryption = new KeyvEncryptNode({ key: secret, encoding: "hex" });
			const data = "hex encoding test";
			const encrypted = encryption.encrypt(data);
			expect(/^[\da-f]+$/i.test(encrypted)).toBe(true);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});
	});

	describe("Keyv integration", () => {
		it("should work with Keyv set and get", async () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const keyv = new Keyv({ encryption });
			await keyv.set("foo", "bar");
			const value = await keyv.get("foo");
			expect(value).toBe("bar");
		});

		it("should work with Keyv for complex objects", async () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const keyv = new Keyv({ encryption });
			const obj = { name: "test", count: 42, nested: { a: true } };
			await keyv.set("obj", obj);
			const value = await keyv.get("obj");
			expect(value).toEqual(obj);
		});

		it("should work with Keyv and custom algorithm", async () => {
			const encryption = new KeyvEncryptNode({ key: secret, algorithm: "aes-128-gcm" });
			const keyv = new Keyv({ encryption });
			await keyv.set("key", "value");
			const value = await keyv.get("key");
			expect(value).toBe("value");
		});
	});
});
