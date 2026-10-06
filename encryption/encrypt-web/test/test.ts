import { faker } from "@faker-js/faker";
import { encryptionTestSuite } from "@keyv/test-suite";
import { Keyv } from "keyv";
import { describe, expect, it } from "vitest";
import KeyvEncryptWeb, { type WebAlgorithm } from "../src/index.js";

const secret = faker.string.alphanumeric(32);

// Standard encryption compliance tests
encryptionTestSuite(it, new KeyvEncryptWeb({ key: secret }));

describe("KeyvEncryptWeb", () => {
	describe("default aes-256-gcm", () => {
		it("should produce different ciphertext each time due to random IV", async () => {
			const encryption = new KeyvEncryptWeb({ key: secret });
			const data = faker.lorem.word();
			const encrypted1 = await encryption.encrypt(data);
			const encrypted2 = await encryption.encrypt(data);
			expect(encrypted1).not.toBe(encrypted2);
		});

		it("should throw on tampered ciphertext", async () => {
			const encryption = new KeyvEncryptWeb({ key: secret });
			const encrypted = await encryption.encrypt(faker.lorem.sentence());
			const binary = atob(encrypted);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}

			bytes[bytes.length - 1] ^= 0xff;
			let tampered = "";
			for (let i = 0; i < bytes.length; i++) {
				tampered += String.fromCharCode(bytes[i]);
			}

			tampered = btoa(tampered);
			await expect(encryption.decrypt(tampered)).rejects.toThrow();
		});

		it("should fail to decrypt with a different key", async () => {
			const encryption1 = new KeyvEncryptWeb({ key: faker.string.alphanumeric(20) });
			const encryption2 = new KeyvEncryptWeb({ key: faker.string.alphanumeric(20) });
			const encrypted = await encryption1.encrypt(faker.lorem.sentence());
			await expect(encryption2.decrypt(encrypted)).rejects.toThrow();
		});
	});

	describe("key handling", () => {
		it("should accept a string key and derive via SHA-256", async () => {
			const encryption = new KeyvEncryptWeb({ key: faker.string.alphanumeric(48) });
			const data = faker.lorem.word();
			const decrypted = await encryption.decrypt(await encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should accept a 32-byte Uint8Array key", async () => {
			const bufferKey = crypto.getRandomValues(new Uint8Array(32));
			const encryption = new KeyvEncryptWeb({ key: bufferKey });
			const data = faker.lorem.sentence();
			const decrypted = await encryption.decrypt(await encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should throw if Uint8Array key has wrong length for aes-256-gcm", () => {
			const badKey = crypto.getRandomValues(new Uint8Array(16));
			expect(() => new KeyvEncryptWeb({ key: badKey })).toThrow("Key must be 32 bytes");
		});
	});

	describe("custom algorithms", () => {
		it("should work with aes-128-gcm", async () => {
			const bufferKey = crypto.getRandomValues(new Uint8Array(16));
			const encryption = new KeyvEncryptWeb({ key: bufferKey, algorithm: "aes-128-gcm" });
			const data = faker.lorem.sentence();
			const decrypted = await encryption.decrypt(await encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-192-gcm", async () => {
			const bufferKey = crypto.getRandomValues(new Uint8Array(24));
			const encryption = new KeyvEncryptWeb({ key: bufferKey, algorithm: "aes-192-gcm" });
			const data = faker.lorem.sentence();
			const decrypted = await encryption.decrypt(await encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should work with aes-128-gcm using string key", async () => {
			const encryption = new KeyvEncryptWeb({
				key: faker.string.alphanumeric(16),
				algorithm: "aes-128-gcm",
			});
			const data = faker.lorem.sentence();
			const decrypted = await encryption.decrypt(await encryption.encrypt(data));
			expect(decrypted).toBe(data);
		});

		it("should accept an algorithm name in any case", async () => {
			const encryption = new KeyvEncryptWeb({
				key: secret,
				algorithm: "AES-128-GCM" as WebAlgorithm,
			});
			const data = faker.lorem.sentence();
			expect(await encryption.decrypt(await encryption.encrypt(data))).toBe(data);
		});

		it("should reject unauthenticated and unknown algorithms when it is created", () => {
			const names = ["aes-128-cbc", "aes-192-cbc", "aes-256-cbc", "aes-256-ctr", "constructor"];
			for (const name of [...names, "__proto__", "toString"]) {
				expect(() => new KeyvEncryptWeb({ key: secret, algorithm: name as WebAlgorithm })).toThrow(
					`Unsupported cipher algorithm: ${name.toLowerCase()}`,
				);
			}
		});

		it("should decrypt values written by earlier releases", async () => {
			const plaintext = '{"value":"bar","expires":null}';
			const written: Array<[WebAlgorithm, string]> = [
				[
					"aes-256-gcm",
					"XgppYlXt4uBeGPMAIv/QRl6G86JDek8mc4g0t7DANZxxaDGJcCGAbEIuucXRhkJf8goY5LZy91aVFA==",
				],
				[
					"aes-128-gcm",
					"6YrW+NvT69iKX12SkNuu6l5ySyvsENRnHbqsUDlyIVdKuxW/G71tNHADR8t14YRt9BsJAeSx/kFL3g==",
				],
			];
			for (const [algorithm, encrypted] of written) {
				const encryption = new KeyvEncryptWeb({ key: "keyv-known-answer", algorithm });
				expect(await encryption.decrypt(encrypted)).toBe(plaintext);
			}
		});

		it("should reject a truncated authentication tag", async () => {
			const encryption = new KeyvEncryptWeb({ key: secret });
			const encrypted = await encryption.encrypt(faker.lorem.word());
			// Keep 28 base64 characters: the 12-byte IV and 9 of the tag's 16 bytes
			await expect(encryption.decrypt(encrypted.slice(0, 28))).rejects.toThrow();
		});

		it("should throw for unsupported algorithm", () => {
			const options = {
				key: faker.string.alphanumeric(16),
				algorithm: "invalid-algorithm",
			};
			// biome-ignore lint/suspicious/noExplicitAny: testing runtime validation with invalid input
			expect(() => new KeyvEncryptWeb(options as any)).toThrow("Unsupported cipher algorithm");
		});
	});

	describe("Keyv integration", () => {
		it("should work with Keyv for complex objects", async () => {
			const encryption = new KeyvEncryptWeb({ key: secret });
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
			const encryption = new KeyvEncryptWeb({ key: secret, algorithm: "aes-128-gcm" });
			const keyv = new Keyv({ encryption });
			const key = faker.string.alphanumeric(10);
			const value = faker.lorem.word();
			await keyv.set(key, value);
			const result = await keyv.get(key);
			expect(result).toBe(value);
		});
	});
});
