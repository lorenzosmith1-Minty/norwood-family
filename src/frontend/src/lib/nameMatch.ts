/**
 * Shared name-normalization and fuzzy-matching utilities for the family
 * profile workflows (Add Myself, possible-match search, claim resolution).
 *
 * Normalization is case-insensitive, ignores punctuation, normalizes periods
 * (so "Jr." and "Jr" compare equal), collapses extra whitespace, and maps
 * common suffix variants (Jr/Jr./Sr/Sr./II/III/IV) to a single canonical form.
 * Matching supports exact equality plus partial/fuzzy (one name contained in
 * the other) so a user-entered name can surface a documented family member
 * even when the spelling or suffix differs.
 */

/** Canonical forms for common name suffixes, keyed by their normalized token. */
const SUFFIX_VARIANTS: Record<string, string> = {
  jr: "jr",
  sr: "sr",
  ii: "ii",
  iii: "iii",
  iv: "iv",
};

/**
 * Normalize a full name to a canonical, comparable form:
 *   - lowercased
 *   - punctuation stripped (periods, apostrophes, quotes, commas)
 *   - whitespace collapsed to single spaces and trimmed
 *   - suffix variants mapped to a single canonical token
 *
 * Examples:
 *   "Julia “Julie” Norwood"  -> "julia julie norwood"
 *   "Lorenzo Smith Jr."      -> "lorenzo smith jr"
 *   "Robert Davis “RD” Sr."  -> "robert davis rd sr"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) => SUFFIX_VARIANTS[part] ?? part)
    .join(" ");
}

/**
 * True when two names refer to the same person under normalization. Returns
 * false for empty inputs. Matches on exact equality after normalization, or on
 * a partial/fuzzy containment in either direction (so "Lorenzo Smith" matches
 * "Lorenzo Smith Jr." and vice versa).
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}
