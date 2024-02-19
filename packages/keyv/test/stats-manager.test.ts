import test from 'ava';
import StatsManager from '../src/stats-manager';

test('will initialize with correct stats at zero', t => {
	const stats = new StatsManager();
	t.is(stats.data.hits, 0);
});

test('will increment hits', t => {
	const stats = new StatsManager();
	stats.hit();
	t.is(stats.data.hits, 1);
});

test('will increment misses', t => {
	const stats = new StatsManager();
	stats.miss();
	t.is(stats.data.misses, 1);
});

test('will increment sets', t => {
	const stats = new StatsManager();
	stats.set();
	t.is(stats.data.sets, 1);
});

test('will increment deletes', t => {
	const stats = new StatsManager();
	stats.delete();
	t.is(stats.data.deletes, 1);
});

test('will reset stats', t => {
	const stats = new StatsManager();
	stats.hit();
	stats.miss();
	stats.set();
	stats.delete();
	t.is(stats.data.hits, 1);
	t.is(stats.data.misses, 1);
	t.is(stats.data.sets, 1);
	t.is(stats.data.deletes, 1);
	stats.reset();
	t.is(stats.data.hits, 0);
	t.is(stats.data.misses, 0);
	t.is(stats.data.sets, 0);
	t.is(stats.data.deletes, 0);
});

test('will not increment hits if disabled', t => {
	const stats = new StatsManager(false);
	stats.hit();
	t.is(stats.data.hits, 0);
});
