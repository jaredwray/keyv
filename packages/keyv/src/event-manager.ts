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
	public off(event: string, listener: EventListener): void {
		if (this._eventListeners.has(event)) {
			const listeners = this._eventListeners.get(event) ?? [];
			const index = listeners.indexOf(listener);
			if (index > -1) {
				listeners.splice(index, 1);
			}

			if (listeners.length === 0) {
				this._eventListeners.delete(event);
			}
		}
	}

	// Emit an event
	public emit(event: string, ...args: any[]): void {
		const listeners = this._eventListeners.get(event);
		if (listeners) {
			for (const listener of listeners) {
				listener(...args);
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

export default EventManager;
module.exports = EventManager;
