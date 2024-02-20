import test from 'ava';
import KeyvStatsManager from '../src/stats-manager';

test('will initialize with correct stats at zero', t => {
	const stats = new KeyvStatsManager();
	t.is(stats.hits, 0);
});

test('will increment hits', t => {
	const stats = new KeyvStatsManager();
	stats.hit();
	t.is(stats.hits, 1);
});

test('will increment misses', t => {
	const stats = new KeyvStatsManager();
	stats.miss();
	t.is(stats.misses, 1);
});

test('will increment sets', t => {
	const stats = new KeyvStatsManager();
	stats.set();
	t.is(stats.sets, 1);
});

test('will increment deletes', t => {
	const stats = new KeyvStatsManager();
	stats.delete();
	t.is(stats.deletes, 1);
});

test('will reset stats', t => {
	const stats = new KeyvStatsManager();
	stats.hit();
	stats.miss();
	stats.set();
	stats.delete();
	t.is(stats.hits, 1);
	t.is(stats.misses, 1);
	t.is(stats.sets, 1);
	t.is(stats.deletes, 1);
	stats.reset();
	t.is(stats.hits, 0);
	t.is(stats.misses, 0);
	t.is(stats.sets, 0);
	t.is(stats.deletes, 0);
});

test('will not increment hits if disabled', t => {
	const stats = new KeyvStatsManager(false);
	stats.hit();
	t.is(stats.hits, 0);
});
