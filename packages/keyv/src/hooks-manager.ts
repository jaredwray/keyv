import { EventManager } from '../src/event-manager';

export type HookHandler = (...args: any[]) => void;

export class HooksManager extends EventManager {
	private readonly _handlers: Map<string, HookHandler[]>;

	constructor() {
		super();
		this._handlers = new Map();
	}

	// Adds a handler function for a specific event
	addHandler(event: string, handler: HookHandler) {
		if (!this.handlers.has(event)) {
			this._handlers.set(event, []);
		}

		this._handlers.get(event)?.push(handler);
	}

	// Removes a specific handler function for a specific event
	removeHandler(event: string, handler: HookHandler) {
		const eventHandlers = this._handlers.get(event);
		if (eventHandlers) {
			const index = eventHandlers.indexOf(handler);
			if (index !== -1) {
				eventHandlers.splice(index, 1);
			}
		}
	}

	// Triggers all handlers for a specific event with provided data
	trigger(event: string, data: any) {
		const eventHandlers = this._handlers.get(event);
		if (eventHandlers) {
			for (const handler of eventHandlers) {
				try {
					handler(data);
				} catch (error) {
					this.emit('error', new Error(`Error in hook handler for event "${event}": ${(<Error>error).message}`));
				}
			}
		}
	}

	// Provides read-only access to the current handlers
	get handlers() {
		// Creating a new map to prevent external modifications to the original map
		return new Map(this._handlers);
	}
}
