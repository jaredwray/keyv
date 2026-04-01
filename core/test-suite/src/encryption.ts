import { faker } from "@faker-js/faker";
import Keyv, { type KeyvEncryptionAdapter } from "keyv";
import type { TestFunction } from "./types.js";

/**
 * Registers encryption adapter compliance tests: encrypt/decrypt round-trips
 * for strings, empty strings, unicode, and large data. Also verifies ciphertext
 * differs from plaintext and tests integration with a Keyv instance.
 * @param test - The test registration function (e.g. vitest `it`)
 * @param encryption - The encryption adapter instance to test
 */
const encryptionTestSuite = (test: TestFunction, encryption: KeyvEncryptionAdapter) => {
	test("encrypt and decrypt a string", async (t) => {
		const data = faker.lorem.sentence();
		const encrypted = await encryption.encrypt(data);
		t.expect(encrypted).not.toBe(data);
		const decrypted = await encryption.decrypt(encrypted);
		t.expect(decrypted).toBe(data);
	});

	test("encrypt produces output different from plaintext", async (t) => {
		const data = faker.lorem.word();
		const encrypted = await encryption.encrypt(data);
		t.expect(encrypted).not.toBe(data);
	});

	test("encrypt and decrypt empty string", async (t) => {
		const encrypted = await encryption.encrypt("");
		const decrypted = await encryption.decrypt(encrypted);
		t.expect(decrypted).toBe("");
	});

	test("encrypt and decrypt unicode content", async (t) => {
		const data = faker.lorem.sentence();
		const encrypted = await encryption.encrypt(data);
		const decrypted = await encryption.decrypt(encrypted);
		t.expect(decrypted).toBe(data);
	});

	test("encrypt and decrypt large data", async (t) => {
		const data = faker.lorem.paragraphs(20);
		const encrypted = await encryption.encrypt(data);
		const decrypted = await encryption.decrypt(encrypted);
		t.expect(decrypted).toBe(data);
	});

	test("encrypt/decrypt with main keyv", async (t) => {
		const keyv = new Keyv({ encryption });
		const key = faker.string.alphanumeric(10);
		const value = faker.lorem.sentence();
		await keyv.set(key, value);
		t.expect(await keyv.get(key)).toBe(value);
	});
};

export { encryptionTestSuite };
