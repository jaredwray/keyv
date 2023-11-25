type EventListener = (...args: any[]) => void;

class EventManager {
	_eventListeners: Map<string, EventListener[]>;
	_maxListeners: number;

	constructor() {
		this._eventListeners = new Map();
		this._maxListeners = 100; // Default maximum number of listeners
	}

	public maxListeners(): number {
		return this._maxListeners;
	}

	// Add an event listener
	public addListener(event: string, listener: EventListener): void {
		this.on(event, listener);
	}

	public on(event: string, listener: EventListener): void {
		if (!this._eventListeners.has(event)) {
			this._eventListeners.set(event, []);
		}

		const listeners = this._eventListeners.get(event);

		if (listeners) {
			if (listeners.length >= this._maxListeners) {
				console.warn(`MaxListenersExceededWarning: Possible event memory leak detected. ${listeners.length + 1} ${event} listeners added. Use setMaxListeners() to increase limit.`);
			}

			listeners.push(listener);
		}
	}

	// Remove an event listener
	public removeListener(event: string, listener: EventListener): void {
		this.off(event, listener);
	}

	public off(event: string, listener: EventListener): void {
		const listeners = this._eventListeners.get(event) ?? [];
		const index = listeners.indexOf(listener);
		if (index > -1) {
			listeners.splice(index, 1);
		}

		if (listeners.length === 0) {
			this._eventListeners.delete(event);
		}
	}

	// Emit an event
	public emit(event: string, ...args: any[]): void {
		const listeners = this._eventListeners.get(event);

		if (listeners && listeners.length > 0) {
			for (const listener of listeners) {
				listener(...args);
			}
		} else if (event === 'error') {
			// If it's an 'error' event with no listeners, throw the error.
			if (args[0] instanceof Error) {
				throw args[0]; // Throws the error object if the first arg is an error
			} else {
				const error = new CustomError(args[0]);
				error.context = args[0];
				throw error;
			}
		}
	}

	// Get all listeners for a specific event
	public listeners(event: string): EventListener[] {
		return this._eventListeners.get(event) ?? [];
	}

	// Remove all listeners for a specific event
	public removeAllListeners(event?: string): void {
		if (event) {
			this._eventListeners.delete(event);
		} else {
			this._eventListeners.clear();
		}
	}

	// Set the maximum number of listeners for a single event
	public setMaxListeners(n: number): void {
		this._maxListeners = n;
	}
}

class CustomError extends Error {
	public context: any;

	constructor(message: string, context?: any) {
		super(message);
		this.context = context;

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CustomError);
		}

		this.name = this.constructor.name;
	}
}

export default EventManager;
module.exports = EventManager;
