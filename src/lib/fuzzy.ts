// Tiny, dependency-free fuzzy matcher. Case-insensitive subsequence scoring
// with bonuses for prefix / word-start / consecutive hits — good enough to power
// a command palette or any "type to filter" list. Pure + reusable; no DOM.

export interface FuzzyMatch {
  /** Higher is better. Only meaningful relative to other matches of same query. */
  score: number;
  /** Indices into `text` that matched, for highlighting. */
  indices: number[];
}

// Characters that start a new "word" — the char after one gets a word-start bonus.
const SEP = /[\s\-_/.:,]/;

/**
 * Score how well `query` fuzzy-matches `text`. Returns null when `text` doesn't
 * contain `query` as a subsequence. An empty query matches everything (score 0).
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();

  const indices: number[] = [];
  let score = 0;
  let qi = 0;
  let prevMatch = -2; // index of the previous matched char in `text`

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (ti === 0) bonus += 8; // matches the very start of the text
    else if (SEP.test(t[ti - 1])) bonus += 6; // start of a word
    else if (text[ti] >= "A" && text[ti] <= "Z" && text[ti - 1] !== text[ti - 1].toUpperCase())
      bonus += 4; // camelCase hump
    if (ti === prevMatch + 1) bonus += 5; // consecutive run

    score += bonus;
    indices.push(ti);
    prevMatch = ti;
    qi++;
  }

  if (qi < q.length) return null; // ran out of text before matching all of query

  // Reward a tight match (few gaps) and short overall text.
  const span = indices[indices.length - 1] - indices[0] + 1;
  score -= Math.max(0, span - q.length) * 0.5;
  score -= t.length * 0.03;

  return { score, indices };
}

/**
 * Filter + rank `items` by how well `key(item)` fuzzy-matches `query`. Stable
 * for equal scores (preserves input order). Empty query returns items unchanged.
 */
export function fuzzyRank<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, i) => ({ item, i, m: fuzzyMatch(query, key(item)) }))
    .filter((r) => r.m !== null)
    .sort((a, b) => b.m!.score - a.m!.score || a.i - b.i)
    .map((r) => r.item);
}
