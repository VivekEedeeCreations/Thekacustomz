/**
 * Sorting helpers for variant attributes. Sizes sort in garment order (XS < S < M < L < XL <
 * 2XL …) rather than alphabetically, numeric sizes (28, 30, 32 / 10.5) numerically after those,
 * then anything else alphabetically. Blank values always go last, whichever direction.
 */

const LETTER_SIZES = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL'];

/** Rank for a size, or null when it isn't a recognised clothing size. */
function sizeRank(raw: string): number | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, '');
  const letter = LETTER_SIZES.indexOf(value);
  if (letter >= 0) return letter;
  // XXL / XXXL and 2XL / 3XL / 4XL … all mean "n extra-large".
  const xs = /^(X{2,})L$/.exec(value);
  if (xs) return LETTER_SIZES.length - 1 + (xs[1]!.length - 1);
  const numbered = /^(\d+)XL$/.exec(value);
  if (numbered) return LETTER_SIZES.length - 1 + (Number(numbered[1]) - 1);
  return null;
}

export function compareSize(a: string | null, b: string | null): number {
  const aa = a?.trim() ?? '';
  const bb = b?.trim() ?? '';
  const ra = sizeRank(aa);
  const rb = sizeRank(bb);
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  const na = Number(aa);
  const nb = Number(bb);
  const aNum = aa !== '' && Number.isFinite(na);
  const bNum = bb !== '' && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return aa.localeCompare(bb, undefined, { sensitivity: 'base', numeric: true });
}

export function compareText(a: string | null, b: string | null): number {
  return (a?.trim() ?? '').localeCompare(b?.trim() ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

export type SortDirection = 'asc' | 'desc';

/**
 * Sorts by `compare` in `direction`, keeping blank values at the end and ties in their original
 * order (Array.prototype.sort is stable).
 */
export function sortBy<T>(
  items: T[],
  get: (item: T) => string | null,
  compare: (a: string | null, b: string | null) => number,
  direction: SortDirection,
): T[] {
  return [...items].sort((x, y) => {
    const a = get(x)?.trim() || null;
    const b = get(y)?.trim() || null;
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const result = compare(a, b);
    return direction === 'asc' ? result : -result;
  });
}
