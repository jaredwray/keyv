import type { KeyvSerializationAdapter } from "keyv";
import superjson from "superjson";

export class KeyvSuperJsonSerializer implements KeyvSerializationAdapter {
	stringify(object: unknown): string {
		return superjson.stringify(object);
	}

	parse<T>(data: string): T {
		return superjson.parse<T>(data);
	}
}

export const superJsonSerializer = new KeyvSuperJsonSerializer();

export default KeyvSuperJsonSerializer;
