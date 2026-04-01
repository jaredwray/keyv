import { randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import { encryptionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, expect, it } from "vitest";
import KeyvEncryptNode from "../src/index.js";

const secret = faker.string.alphanumeric(32);

// Standard encryption compliance tests
encryptionTestSuite(it, new KeyvEncryptNode({ key: secret }));

describe("KeyvEncryptNode", () => {
	describe("default aes-256-gcm", () => {
		it("should produce different ciphertext each time due to random IV", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const data = faker.lorem.word();
			const encrypted1 = encryption.encrypt(data);
			const encrypted2 = encryption.encrypt(data);
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("should throw on tampered ciphertext", () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const encrypted = encryption.encrypt(faker.lorem.sentence());
			const buffer = Buffer.from(encrypted, "base64");
			buffer[buffer.length - 1] ^= 0xff;
			const tampered = buffer.toString("base64");
			expect(() => encryption.decrypt(tampered)).toThrow();
		});

		it("should fail to decrypt with a different key", () => {
			const encryption1 = new KeyvEncryptNode({ key: faker.string.alphanumeric(20) });
			const encryption2 = new KeyvEncryptNode({ key: faker.string.alphanumeric(20) });
			const encrypted = encryption1.encrypt(faker.lorem.sentence());
			expect(() => encryption2.decrypt(encrypted)).toThrow();
		});
	});

	describe("key handling", () => {
		it("should accept a string key and derive via SHA-256", () => {
			const encryption = new KeyvEncryptNode({ key: faker.string.alphanumeric(48) });
			const data = faker.lorem.word();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should accept a 32-byte Buffer key", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey });
			const data = faker.lorem.sentence();
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
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-192-gcm", () => {
			const bufferKey = randomBytes(24);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "aes-192-gcm" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-128-gcm using string key", () => {
			const encryption = new KeyvEncryptNode({
				key: faker.string.alphanumeric(16),
				algorithm: "aes-128-gcm",
			});
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with chacha20-poly1305", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "chacha20-poly1305" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-256-ccm", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "aes-256-ccm" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-256-cbc (non-AEAD)", () => {
			const bufferKey = randomBytes(32);
			const encryption = new KeyvEncryptNode({ key: bufferKey, algorithm: "aes-256-cbc" });
			const data = faker.lorem.sentence();
			const decrypted = encryption.decrypt(encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw for unsupported algorithm", () => {
			expect(
				() =>
					new KeyvEncryptNode({
						key: faker.string.alphanumeric(16),
						algorithm: "invalid-algorithm",
					}),
			).toThrow("Unsupported cipher algorithm");
		});
	});

	describe("encoding option", () => {
		it("should support hex encoding", () => {
			const encryption = new KeyvEncryptNode({ key: secret, encoding: "hex" });
			const data = faker.lorem.sentence();
			const encrypted = encryption.encrypt(data);
			expect(/^[\da-f]+$/i.test(encrypted)).toBe(true);
			const decrypted = encryption.decrypt(encrypted);
			expect(decrypted).toBe(data);
		});
	});

	describe("Keyv integration", () => {
		it("should work with Keyv for complex objects", async () => {
			const encryption = new KeyvEncryptNode({ key: secret });
			const keyv = new Keyv({ encryption });
			const obj = {
				name: faker.person.fullName(),
				count: faker.number.int(100),
				nested: { a: faker.datatype.boolean() },
			};
			const key = faker.string.alphanumeric(10);
			await keyv.set(key, obj);
			const result = await keyv.get(key);
			expect(result).toEqual(obj);
		});

		it("should work with Keyv and custom algorithm", async () => {
			const encryption = new KeyvEncryptNode({ key: secret, algorithm: "aes-128-gcm" });
			const keyv = new Keyv({ encryption });
			const key = faker.string.alphanumeric(10);
			const value = faker.lorem.word();
			await keyv.set(key, value);
			const result = await keyv.get(key);
			expect(result).toBe(value);
		});
	});
});
