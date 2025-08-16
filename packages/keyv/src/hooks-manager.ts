import EventManager from "./event-manager.js";

// biome-ignore lint/suspicious/noExplicitAny: type format
type HookHandler = (...arguments_: any[]) => void;

class HooksManager extends EventManager {
	_hookHandlers: Map<string, HookHandler[]>;

	constructor() {
		super();
		this._hookHandlers = new Map();
	}

	// Adds a handler function for a specific event
	addHandler(event: string, handler: HookHandler) {
		const eventHandlers = this._hookHandlers.get(event);
		if (eventHandlers) {
			eventHandlers.push(handler);
		} else {
			this._hookHandlers.set(event, [handler]);
		}
	}

	// Removes a specific handler function for a specific event
	removeHandler(event: string, handler: HookHandler) {
		const eventHandlers = this._hookHandlers.get(event);
		if (eventHandlers) {
			const index = eventHandlers.indexOf(handler);
			if (index !== -1) {
				eventHandlers.splice(index, 1);
			}
		}
	}

	// Triggers all handlers for a specific event with provided data
	// biome-ignore lint/suspicious/noExplicitAny: type format
	trigger(event: string, data: any) {
		const eventHandlers = this._hookHandlers.get(event);
		if (eventHandlers) {
			for (const handler of eventHandlers) {
				try {
					handler(data);
				} catch (error) {
					this.emit(
						"error",
						new Error(
							`Error in hook handler for event "${event}": ${(error as Error).message}`,
						),
					);
				}
			}
		}
	}

	// Provides read-only access to the current handlers
	get handlers() {
		// Creating a new map to prevent external modifications to the original map
		return new Map(this._hookHandlers);
	}
}

export default HooksManager;
