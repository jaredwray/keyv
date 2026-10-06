import { getCiphers, randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import { encryptionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, expect, it } from "vitest";
import KeyvEncryptNode, { type NodeAlgorithm, type NodeEncoding } from "../src/index.js";

const secret = faker.string.alphanumeric(32);

const algorithms: Array<[NodeAlgorithm, number]> = [
	["aes-128-gcm", 16],
	["aes-192-gcm", 24],
	["aes-256-gcm", 32],
	["aes-128-ccm", 16],
	["aes-192-ccm", 24],
	["aes-256-ccm", 32],
	["chacha20-poly1305", 32],
];
const encodings: NodeEncoding[] = ["base64", "base64url", "hex"];

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

		it("should round-trip with every supported algorithm and encoding", () => {
			for (const [algorithm, keyLength] of algorithms) {
				for (const encoding of encodings) {
					for (const key of [faker.string.alphanumeric(20), randomBytes(keyLength)]) {
						const encryption = new KeyvEncryptNode({ key, algorithm, encoding });
						const data = faker.lorem.sentence();
						expect(encryption.decrypt(encryption.encrypt(data))).toBe(data);
					}
				}
			}
		});

		it("should accept an algorithm name in any case", () => {
			const encryption = new KeyvEncryptNode({
				key: secret,
				algorithm: "AES-256-GCM" as NodeAlgorithm,
			});
			const data = faker.lorem.sentence();
			expect(encryption.decrypt(encryption.encrypt(data))).toBe(data);
		});

		it("should reject every other cipher when it is created", () => {
			const supported = new Set<string>(algorithms.map(([algorithm]) => algorithm));
			const others = getCiphers().filter((name) => !supported.has(name.toLowerCase()));
			// Unauthenticated modes, and ciphers that used to be accepted but failed on first use
			const named = ["aes-256-cbc", "aes-256-ctr", "aes-256-ecb", "aes-256-xts", "chacha20"];
			for (const name of [...others, ...named, "invalid-algorithm", "constructor", "__proto__"]) {
				expect(
					() => new KeyvEncryptNode({ key: secret, algorithm: name as NodeAlgorithm }),
				).toThrow(`Unsupported cipher algorithm: ${name.toLowerCase()}`);
			}
		});

		it("should decrypt values written by earlier releases", () => {
			const plaintext = '{"value":"bar","expires":null}';
			const written: Array<[NodeAlgorithm, NodeEncoding, string]> = [
				[
					"aes-256-gcm",
					"base64",
					"9rW+AqdW2VXONYGhq/vTs6q9+t+KNpmpmcgpxvszz+xLGrHJ6AcJwM9ua0poxgcPGSPtr4sX8WHMeA==",
				],
				[
					"aes-256-gcm",
					"hex",
					"a511475426b81cfea3c99d47729459c5b5b6105c2c5d519ff43f84e43b5db579561210b882ec1364a7e20d11cec91aed8a1a566cdfe27a7cb0b9",
				],
				[
					"aes-128-ccm",
					"base64",
					"VPRcZfE2i7BwZe/2otB8i5G1enx1DbNU2ER2EN9coWSRZmXZXvaJUWhviBY6w4vidCV3X8caL2oMKA==",
				],
				[
					"chacha20-poly1305",
					"base64",
					"thXD+RGfnR+7PdwvjKoF/4UsV53sNxrmPDspralOpW4+Vu+87Pu8hbuN+SFLvkMPLdNsuHhuMRQJaQ==",
				],
			];
			for (const [algorithm, encoding, encrypted] of written) {
				const encryption = new KeyvEncryptNode({ key: "keyv-known-answer", algorithm, encoding });
				expect(encryption.decrypt(encrypted)).toBe(plaintext);
			}
		});

		it("should reject a truncated authentication tag", () => {
			for (const [algorithm] of algorithms) {
				const encryption = new KeyvEncryptNode({ key: secret, algorithm });
				const packed = Buffer.from(encryption.encrypt(faker.lorem.word()), "base64");
				const truncated = packed.subarray(0, 12 + 8).toString("base64");
				expect(() => encryption.decrypt(truncated)).toThrow("Invalid authentication tag length");
			}
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

		it("should reject encodings that can't hold arbitrary bytes", () => {
			for (const encoding of ["utf8", "utf-8", "ascii", "latin1", "binary", "utf16le", "ucs2"]) {
				expect(
					() => new KeyvEncryptNode({ key: secret, encoding: encoding as NodeEncoding }),
				).toThrow(`Unsupported encoding: ${encoding}`);
			}
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
