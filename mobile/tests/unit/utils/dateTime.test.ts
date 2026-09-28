/**
 * Pure-logic tests for src/utils/dateTime.ts (DG approval queue's month
 * grouping + relative-time display) — no rendering, matching this project's
 * established tests/unit/ precedent (see offlineQueue.test.ts).
 */
import { formatRelativeTime, groupByMonth, monthGroupKey, pluralKey } from '../../../src/utils/dateTime';

describe('pluralKey', () => {
	test('count === 1 selects _one', () => {
		expect(pluralKey('dateTime.minutesAgo', 1)).toBe('dateTime.minutesAgo_one');
	});

	test.each([0, 2, 5, 100, -1])('count === %d selects _other', (count) => {
		expect(pluralKey('dateTime.minutesAgo', count)).toBe('dateTime.minutesAgo_other');
	});
});

describe('monthGroupKey', () => {
	test('groups by calendar year-month, ignoring day/time', () => {
		expect(monthGroupKey('2026-09-01T00:00:00.000Z')).toBe(monthGroupKey('2026-09-27T23:59:59.000Z'));
	});

	test('different months produce different keys', () => {
		// Mid-month, noon UTC on both sides — safely clear of any midnight
		// month-boundary rollover under any real-world local timezone offset
		// (this project's own dev machine runs at UTC+5, per Step 21's
		// documented `date`-column timezone bug; a `T23:59:59Z`/`T00:00:00Z`
		// pair here would falsely land in the same local month and flip this
		// assertion).
		expect(monthGroupKey('2026-09-15T12:00:00.000Z')).not.toBe(monthGroupKey('2026-10-15T12:00:00.000Z'));
	});

	test('different years produce different keys even for the same month number', () => {
		expect(monthGroupKey('2025-09-15T12:00:00.000Z')).not.toBe(monthGroupKey('2026-09-15T12:00:00.000Z'));
	});
});

describe('formatRelativeTime', () => {
	const fakeT = (key: string, options?: Record<string, unknown>) =>
		options && 'count' in options ? `${key}:${(options as { count: number }).count}` : key;

	const NOW = new Date('2026-09-27T12:00:00.000Z').getTime();

	test('under a minute reads "just now"', () => {
		expect(formatRelativeTime(new Date(NOW - 30 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.justNow');
	});

	test('a future/equal timestamp never goes negative — clamped to "just now"', () => {
		expect(formatRelativeTime(new Date(NOW + 5000).toISOString(), fakeT, NOW)).toBe('dateTime.justNow');
	});

	test('1 minute exactly', () => {
		expect(formatRelativeTime(new Date(NOW - 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.minutesAgo_one:1');
	});

	test('90 seconds still reads as 1 minute (floor, not round)', () => {
		expect(formatRelativeTime(new Date(NOW - 90 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.minutesAgo_one:1');
	});

	test('45 minutes', () => {
		expect(formatRelativeTime(new Date(NOW - 45 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.minutesAgo_other:45');
	});

	test('1 hour exactly rolls over to the hours bucket, not 60 minutes', () => {
		expect(formatRelativeTime(new Date(NOW - 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.hoursAgo_one:1');
	});

	test('5 hours', () => {
		expect(formatRelativeTime(new Date(NOW - 5 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.hoursAgo_other:5');
	});

	test('1 day exactly rolls over to the days bucket, not 24 hours', () => {
		expect(formatRelativeTime(new Date(NOW - 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.daysAgo_one:1');
	});

	test('3 days', () => {
		expect(formatRelativeTime(new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.daysAgo_other:3');
	});

	test('1 week exactly rolls over to the weeks bucket, not 7 days', () => {
		expect(formatRelativeTime(new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.weeksAgo_one:1');
	});

	test('3 weeks', () => {
		expect(formatRelativeTime(new Date(NOW - 21 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.weeksAgo_other:3');
	});

	test('1 month (30 days) rolls over to the months bucket', () => {
		expect(formatRelativeTime(new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.monthsAgo_one:1');
	});

	test('6 months', () => {
		expect(formatRelativeTime(new Date(NOW - 180 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.monthsAgo_other:6');
	});

	test('1 year (365 days) rolls over to the years bucket', () => {
		expect(formatRelativeTime(new Date(NOW - 365 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.yearsAgo_one:1');
	});

	test('2 years', () => {
		expect(formatRelativeTime(new Date(NOW - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(), fakeT, NOW)).toBe('dateTime.yearsAgo_other:2');
	});
});

describe('groupByMonth', () => {
	test('groups consecutive same-month items into one group', () => {
		const items = [
			{ id: 'a', submittedAt: '2026-09-01T00:00:00.000Z' },
			{ id: 'b', submittedAt: '2026-09-15T00:00:00.000Z' },
			{ id: 'c', submittedAt: '2026-09-27T00:00:00.000Z' },
		];
		const groups = groupByMonth(items);
		expect(groups).toHaveLength(1);
		expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
	});

	test('creates separate groups per distinct month, in first-encountered order', () => {
		const items = [
			{ id: 'aug', submittedAt: '2026-08-05T00:00:00.000Z' },
			{ id: 'sep1', submittedAt: '2026-09-01T00:00:00.000Z' },
			{ id: 'sep2', submittedAt: '2026-09-20T00:00:00.000Z' },
		];
		const groups = groupByMonth(items);
		expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['aug'], ['sep1', 'sep2']]);
	});

	test('an item for an earlier month appearing later in the array still starts its own group at that point (input order preserved, not re-sorted)', () => {
		const items = [
			{ id: 'sep', submittedAt: '2026-09-10T00:00:00.000Z' },
			{ id: 'aug', submittedAt: '2026-08-10T00:00:00.000Z' },
		];
		const groups = groupByMonth(items);
		expect(groups.map((g) => g.monthKey)).toEqual(['2026-09', '2026-08']);
	});

	test('empty input produces no groups', () => {
		expect(groupByMonth([])).toEqual([]);
	});

	test('every group carries a non-empty human-readable monthLabel', () => {
		const groups = groupByMonth([{ id: 'a', submittedAt: '2026-09-10T00:00:00.000Z' }]);
		expect(groups[0].monthLabel.length).toBeGreaterThan(0);
	});
});
