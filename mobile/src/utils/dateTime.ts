/**
 * Pure date/time helpers for the DG approval queue's month-grouped view
 * (user request: pending team-approval requests grouped by the month they
 * were submitted, each showing an exact submitted date/time plus a relative
 * "how long ago" string).
 *
 * Exact date/time formatting deliberately reuses the device-locale
 * `toLocaleDateString`/`toLocaleTimeString` approach `VisitCalendarScreen.tsx`
 * already established for Step 21's section-date headers, rather than
 * building a second, parallel translated-month-name system — one convention,
 * not two competing ones.
 *
 * The relative "time ago" wording (just now / N minutes ago / ...) has no
 * existing precedent, so it's translated via the new `dateTime.*` i18n keys.
 * Pluralization is resolved manually via `pluralKey` rather than relying on
 * i18next's Intl.PluralRules-backed automatic pluralization, since this
 * project has no way to verify Hermes's ICU data completeness for `ur`/`sd`
 * on a real device (see Memory.md's repeated "can't verify without a real
 * device" caveats for anything runtime-locale-dependent) — `_one`/`_other`
 * selection here is 100% deterministic JS, not engine-dependent.
 */

export type TFunction = (key: string, options?: Record<string, unknown>) => string;

/** `_one` for exactly 1, `_other` for everything else (0, negative, 2+) —
 *  the same simple two-form split English uses; a language whose grammar
 *  doesn't distinguish singular/plural can just give both suffixes the same
 *  wording without tripping the translation-parity test (which only flags a
 *  value identical to the *English* source, never two sibling keys in the
 *  same language being equal to each other). */
export function pluralKey(base: string, count: number): string {
  return count === 1 ? `${base}_one` : `${base}_other`;
}

/** "27 September 2026, 7:59 PM" (device locale/24h-setting aware, matching
 *  the app's existing VisitCalendarScreen precedent). */
export function formatExactDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

/** "September 2026" — device-locale month/year, used as the month-group
 *  section header label. */
export function formatMonthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Stable sort/group key for "same calendar month" — deliberately NOT the
 *  locale-formatted label (which could theoretically vary in punctuation
 *  across locales) so grouping logic never depends on display formatting. */
export function monthGroupKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** "just now" / "5 minutes ago" / "3 hours ago" / "2 days ago" /
 *  "1 week ago" / "4 months ago" / "1 year ago" — largest whole unit that's
 *  still >= 1, per the user's exact spec (just now / minute / hour / day /
 *  week / month), extended with a years bucket so a request pending for
 *  over a year doesn't render as an implausible "14 months ago". `now` is
 *  injectable for deterministic testing. */
export function formatRelativeTime(iso: string, t: TFunction, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());

  if (diffMs < MINUTE) return t('dateTime.justNow');

  const buckets: { unitMs: number; base: string }[] = [
    { unitMs: MINUTE, base: 'dateTime.minutesAgo' },
    { unitMs: HOUR, base: 'dateTime.hoursAgo' },
    { unitMs: DAY, base: 'dateTime.daysAgo' },
    { unitMs: WEEK, base: 'dateTime.weeksAgo' },
    { unitMs: MONTH, base: 'dateTime.monthsAgo' },
    { unitMs: YEAR, base: 'dateTime.yearsAgo' },
  ];

  let chosen = buckets[buckets.length - 1];
  for (let i = buckets.length - 1; i >= 0; i -= 1) {
    if (diffMs >= buckets[i].unitMs) {
      chosen = buckets[i];
      break;
    }
  }

  const count = Math.max(1, Math.floor(diffMs / chosen.unitMs));
  return t(pluralKey(chosen.base, count), { count });
}

export type WithSubmittedAt = { submittedAt: string };

export type MonthGroup<T> = { monthKey: string; monthLabel: string; items: T[] };

/**
 * Groups items by calendar month, preserving the order they appear in the
 * input array (the DG approval queue's backend already returns pending
 * requests oldest-submitted-first, `order by tar.submitted_at asc` in
 * approval.repo.js — grouping preserves that so the oldest pending month
 * appears first and, within it, the oldest request first, matching a
 * "work through the backlog oldest-first" review order). Pure function, no
 * React/rendering — testable in isolation.
 */
export function groupByMonth<T extends WithSubmittedAt>(items: T[]): MonthGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, MonthGroup<T>>();

  for (const item of items) {
    const key = monthGroupKey(item.submittedAt);
    let group = byKey.get(key);
    if (!group) {
      group = { monthKey: key, monthLabel: formatMonthLabel(item.submittedAt), items: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }

  return order.map((key) => byKey.get(key)!);
}
