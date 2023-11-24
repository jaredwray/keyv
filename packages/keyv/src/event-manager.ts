export type EventListener = (...args: any[]) => void;

export class EventManager {
	private readonly events: Map<string, EventListener[]>;
	private maxListeners: number;

	constructor() {
		this.events = new Map();
		this.maxListeners = 100; // Default maximum number of listeners
	}

	// Add an event listener
	public on(event: string, listener: EventListener): void {
		if (!this.events.has(event)) {
			this.events.set(event, []);
		}

		const listeners = this.events.get(event);

		if (listeners) {
			if (listeners.length >= this.maxListeners) {
				console.warn(`MaxListenersExceededWarning: Possible event memory leak detected. ${listeners.length + 1} ${event} listeners added. Use setMaxListeners() to increase limit.`);
			}

			listeners.push(listener);
		}
	}

	// Remove an event listener
	public off(event: string, listener: EventListener): void {
		if (this.events.has(event)) {
			const listeners = this.events.get(event) ?? [];
			const index = listeners.indexOf(listener);
			if (index > -1) {
				listeners.splice(index, 1);
			}

			if (listeners.length === 0) {
				this.events.delete(event);
			}
		}
	}

	// Emit an event
	public emit(event: string, ...args: any[]): void {
		const listeners = this.events.get(event);
		if (listeners) {
			for (const listener of listeners) {
				listener(...args);
			}
		}
	}

	// Get all listeners for a specific event
	public listeners(event: string): EventListener[] {
		return this.events.get(event) ?? [];
	}

	// Remove all listeners for a specific event
	public removeAllListeners(event?: string): void {
		if (event) {
			this.events.delete(event);
		} else {
			this.events.clear();
		}
	}

	// Set the maximum number of listeners for a single event
	public setMaxListeners(n: number): void {
		this.maxListeners = n;
	}
}
