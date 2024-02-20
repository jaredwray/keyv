import EventManager from './event-manager';

class StatsManager extends EventManager {
	public enabled = true;

	public hits = 0;
	public misses = 0;
	public sets = 0;
	public deletes = 0;
	public errors = 0;

	constructor(enabled?: boolean) {
		super();
		if (enabled !== undefined) {
			this.enabled = enabled;
		}

		this.reset();
	}

	hit() {
		if (this.enabled) {
			this.hits++;
		}
	}

	miss() {
		if (this.enabled) {
			this.misses++;
		}
	}

	set() {
		if (this.enabled) {
			this.sets++;
		}
	}

	delete() {
		if (this.enabled) {
			this.deletes++;
		}
	}

	reset() {
		this.hits = 0;
		this.misses = 0;
		this.sets = 0;
		this.deletes = 0;
		this.errors = 0;
	}
}

export default StatsManager;
module.exports = StatsManager;
