export type ProgressRange = '7' | '30' | '90' | 'all';
const DAY = 86400000;
const midnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const calendarDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY;
const timestamp = (value: string) => typeof value !== 'string' || !value.trim() ? NaN : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).getTime() : new Date(value).getTime();

export function progressRangeStart(range: ProgressRange, now = new Date()): number {
  if (range === 'all') return 0;
  const start = midnight(now);
  start.setDate(start.getDate() - Number(range) + 1);
  return start.getTime();
}

export function activityInRange(value: string, since: number, now = new Date()): boolean {
  const time = timestamp(value);
  return Number.isFinite(time) && time >= since && time <= now.getTime();
}

export function activityBuckets(dates: string[], since: number, now = new Date()) {
  const times = dates.map(timestamp).filter(time => Number.isFinite(time) && time >= since && time <= now.getTime());
  const start = since ? midnight(new Date(since)) : times.length ? midnight(new Date(times.reduce((earliest, time) => Math.min(earliest, time), Infinity))) : midnight(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const days = calendarDay(now) - calendarDay(start) + 1;
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1;
  const period = days <= 7 ? 'Daily' : days <= 90 ? 'Weekly' : months <= 24 ? 'Monthly' : 'Yearly';
  if (period === 'Monthly') start.setDate(1);
  if (period === 'Yearly') start.setMonth(0, 1);
  const yearStep = Math.max(1, Math.ceil((now.getFullYear() - start.getFullYear() + 1) / 24));
  const buckets: { start: number; end: number; label: string; count: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    const next = new Date(cursor);
    if (period === 'Daily' || period === 'Weekly') next.setDate(next.getDate() + (period === 'Daily' ? 1 : 7));
    else if (period === 'Monthly') next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + yearStep);
    const end = Math.min(next.getTime() - 1, now.getTime());
    const label = period === 'Monthly' ? cursor.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      : period === 'Yearly' ? `${cursor.getFullYear()}${yearStep > 1 ? `-${Math.min(now.getFullYear(), next.getFullYear() - 1)}` : ''}`
      : cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(start.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
    buckets.push({ start: cursor.getTime(), end, label, count: times.filter(time => time >= cursor.getTime() && time <= end).length });
    cursor.setTime(next.getTime());
  }
  return { period, buckets };
}
