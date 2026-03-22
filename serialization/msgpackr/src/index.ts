import { Buffer } from "node:buffer";
import type { KeyvSerializationAdapter } from "keyv";
import { Packr } from "msgpackr";

export class KeyvMsgpackrSerializer implements KeyvSerializationAdapter {
	private readonly packr: Packr;

	constructor() {
		this.packr = new Packr({ structuredClone: true });
	}

	stringify(object: unknown): string {
		const binary = this.packr.pack(object);
		return Buffer.from(binary).toString("base64");
	}

	parse<T>(data: string): T {
		const binary = Buffer.from(data, "base64");
		return this.packr.unpack(binary) as T;
	}
}

export const msgpackrSerializer = new KeyvMsgpackrSerializer();

export default KeyvMsgpackrSerializer;
