class Stats {
	currentSize: number;
	hits: number;
	misses: number;
	averageLoadPenalty: number;
	loadSuccessCount: number;
	loadExceptionCount: number;
	totalLoadTime: number;
	startTime: number;

	constructor() {
		this.currentSize = 0;
		this.hits = 0;
		this.misses = 0;
		this.averageLoadPenalty = 0;
		this.loadSuccessCount = 0;
		this.loadExceptionCount = 0;
		this.totalLoadTime = 0;
		this.startTime = 0;
	}

	incrementHits(): void {
		this.hits++;
	}

	incrementMisses(): void {
		this.misses++;
	}

	incrementLoadSuccess(): void {
		this.loadSuccessCount++;
	}

	incrementLoadException(): void {
		this.loadExceptionCount++;
	}

	updateCurrentSize(size: number): void {
		this.currentSize = size;
	}

	get hitRate(): number {
		return this.hits / (this.hits + this.misses);
	}

	public createTimer(startTime?: number): Timer {
		return new Timer(startTime);
	}
}

class Timer {
	startTime: number;
	totalLoadTime: number;

	constructor(startTime?: number) {
		this.startTime = startTime || 0;
		this.totalLoadTime = 0;
	}

	start(): void {
		this.startTime = Date.now();
	}

	stop(): number {
		const elapsedTime = Date.now() - this.startTime;
		this.totalLoadTime += elapsedTime;
		return this.totalLoadTime;
	}
}
