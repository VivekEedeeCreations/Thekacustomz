export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  /** First and last day, inclusive, as yyyy-mm-dd. */
  from: string;
  to: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (value: string) => new Date(`${value}T00:00:00`);

const dayFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

/** The period of `kind` containing `anchor` (yyyy-mm-dd). Weeks run Monday–Sunday. */
export function periodFor(kind: PeriodKind, anchor: string): Period {
  const d = parse(anchor);
  switch (kind) {
    case 'day':
      return { kind, from: anchor, to: anchor, label: dayFmt.format(d) };
    case 'week': {
      const start = new Date(d);
      start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return {
        kind,
        from: iso(start),
        to: iso(end),
        label: `${shortFmt.format(start)} – ${shortFmt.format(end)} ${end.getFullYear()}`,
      };
    }
    case 'month': {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { kind, from: iso(start), to: iso(end), label: monthFmt.format(start) };
    }
    case 'year':
      return {
        kind,
        from: `${d.getFullYear()}-01-01`,
        to: `${d.getFullYear()}-12-31`,
        label: String(d.getFullYear()),
      };
  }
}

/** Moves the anchor date one period forward (1) or back (-1). */
export function shiftAnchor(kind: PeriodKind, anchor: string, delta: 1 | -1): string {
  const d = parse(anchor);
  if (kind === 'day') d.setDate(d.getDate() + delta);
  else if (kind === 'week') d.setDate(d.getDate() + 7 * delta);
  else if (kind === 'month') d.setMonth(d.getMonth() + delta, 1);
  else d.setFullYear(d.getFullYear() + delta, 0, 1);
  return iso(d);
}

/** Whole days from today until `date` (negative = overdue). */
export function daysUntil(date: string, today: string): number {
  return Math.round((parse(date).getTime() - parse(today).getTime()) / 86_400_000);
}
