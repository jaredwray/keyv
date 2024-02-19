import EventManager from './event-manager';

type StatsData = {
	hits: number;
	misses: number;
	sets: number;
	deletes: number;
	errors: number;
};

class StatsManager extends EventManager {
	public data: StatsData = {
		hits: 0,
		misses: 0,
		sets: 0,
		deletes: 0,
		errors: 0,
	};

	public enabled = true;

	constructor(enabled?: boolean) {
		super();
		if (enabled !== undefined) {
			this.enabled = enabled;
		}

		this.reset();
	}

	hit() {
		if (this.enabled) {
			this.data.hits++;
		}
	}

	miss() {
		if (this.enabled) {
			this.data.misses++;
		}
	}

	set() {
		if (this.enabled) {
			this.data.sets++;
		}
	}

	delete() {
		if (this.enabled) {
			this.data.deletes++;
		}
	}

	reset() {
		if (this.enabled) {
			this.data = {
				hits: 0,
				misses: 0,
				sets: 0,
				deletes: 0,
				errors: 0,
			};
		}
	}
}

export default StatsManager;
module.exports = StatsManager;
