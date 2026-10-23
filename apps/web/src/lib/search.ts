/** Search helpers shared by searchable pickers. */

export interface SearchableOption {
  value: string;
  label: string;
  /** Extra text that matches the search but isn't the main label (e.g. category, barcode). */
  keywords?: string;
  disabled?: boolean;
  /** Small note shown after the label, e.g. "(already added)". */
  hint?: string;
}

/** Every word typed must appear somewhere in the label or keywords, in any order. */
export function matchesSearch(option: SearchableOption, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${option.label} ${option.keywords ?? ''}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
