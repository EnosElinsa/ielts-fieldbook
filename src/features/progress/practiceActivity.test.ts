import { expect, test } from 'vitest';
import { activityBuckets, activityInRange, progressRangeStart } from './practiceActivity';

const now = new Date(2026, 9, 14, 12);
test('seven-day ranges include the whole first local day and use daily buckets', () => {
  const since = progressRangeStart('7', now);
  expect(since).toBe(new Date(2026, 9, 8).getTime());
  const activity = activityBuckets(['2026-10-08', '2026-10-14', 'bad date', '2026-10-15'], since, now);
  expect(activity.period).toBe('Daily');
  expect(activity.buckets).toHaveLength(7);
  expect(activity.buckets.reduce((sum, row) => sum + row.count, 0)).toBe(2);
  expect(activityInRange('2026-10-08', since, now)).toBe(true);
});

test('30 and 90 days cover every selected attempt instead of only four weeks', () => {
  for (const [range, length] of [['30', 5], ['90', 13]] as const) {
    const since = progressRangeStart(range, now);
    const activity = activityBuckets([new Date(since).toISOString(), now.toISOString()], since, now);
    expect(activity.period).toBe('Weekly');
    expect(activity.buckets).toHaveLength(length);
    expect(activity.buckets.reduce((sum, row) => sum + row.count, 0)).toBe(2);
    expect(activity.buckets[0].start).toBe(since);
  }
});

test('all-time history has bounded monthly or yearly buckets without losing older attempts', () => {
  const dates = ['2024-01-01', '2025-06-01', '2026-10-01'];
  const activity = activityBuckets(dates, 0, now);
  expect(activity.buckets.length).toBeLessThanOrEqual(24);
  expect(activity.buckets.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  expect(activityInRange('invalid', 0, now)).toBe(false);
  expect(activityInRange('2026-10-15', 0, now)).toBe(false);
});
