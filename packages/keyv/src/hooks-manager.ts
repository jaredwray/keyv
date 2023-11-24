export class HooksManager extends EventTarget {
	// eslint-disable-next-line @typescript-eslint/ban-types
	private readonly _handlers: Map<string, Function[]>;

	constructor() {
		super();
		this._handlers = new Map();
	}

	// Adds a handler function for a specific event
	// eslint-disable-next-line @typescript-eslint/ban-types
	addHandler(event: string, handler: Function) {
		if (!this.handlers.has(event)) {
			this._handlers.set(event, []);
		}

		this._handlers.get(event)?.push(handler);
	}

	// Removes a specific handler function for a specific event
	// eslint-disable-next-line @typescript-eslint/ban-types
	removeHandler(event: string, handler: Function) {
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
					this.dispatchEvent(new CustomEvent('error', {detail: error}));
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
