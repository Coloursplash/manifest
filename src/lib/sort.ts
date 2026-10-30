// Sort order for the grid, persisted locally. The timeline ignores this — it's
// always date-desc. Entries missing the sort field sort to the end.

import { readPref, writePref } from "./prefs";
import { firstStarted, lastDone } from "./logs";
import type { Entry } from "./types";

export type SortKey =
  | "title"
  | "title-desc"
  | "finished"
  | "started"
  | "released"
  | "released-asc"
  | "score"
  | "score-asc";

export const SORT_KEYS: SortKey[] = [
  "title",
  "title-desc",
  "finished",
  "started",
  "released",
  "released-asc",
  "score",
  "score-asc",
];

export const SORT_LABEL: Record<SortKey, string> = {
  title: "Name A–Z",
  "title-desc": "Name Z–A",
  finished: "Recently finished",
  started: "Recently started",
  released: "Newest release",
  "released-asc": "Oldest release",
  score: "Highest rated",
  "score-asc": "Lowest rated",
};

const KEY = "manifest-sort";

export function getSort(): SortKey {
  const v = readPref(KEY);
  return v && (SORT_KEYS as string[]).includes(v) ? (v as SortKey) : "title";
}

export function setSort(k: SortKey): SortKey {
  writePref(KEY, k);
  return k;
}

function byTitle(a: Entry, b: Entry): number {
  return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
}

/** Compare by a date string (YYYY-MM-DD) descending; missing dates sort last,
 *  ties broken by title. */
function byDateDesc(get: (e: Entry) => string | undefined) {
  return (a: Entry, b: Entry): number => {
    const av = get(a) ?? "";
    const bv = get(b) ?? "";
    if (av !== bv) return av < bv ? 1 : -1;
    return byTitle(a, b);
  };
}

/** Compare by a numeric field; `dir` sets direction. Missing values always sort
 *  last (regardless of direction), ties broken by title. */
function byNumber(get: (e: Entry) => number | undefined, dir: "asc" | "desc") {
  return (a: Entry, b: Entry): number => {
    const av = get(a);
    const bv = get(b);
    const am = av == null;
    const bm = bv == null;
    if (am && bm) return byTitle(a, b);
    if (am) return 1;
    if (bm) return -1;
    if (av !== bv) return dir === "asc" ? av - bv : bv - av;
    return byTitle(a, b);
  };
}

const COMPARATORS: Record<SortKey, (a: Entry, b: Entry) => number> = {
  title: byTitle,
  "title-desc": (a, b) => -byTitle(a, b),
  finished: byDateDesc(lastDone),
  started: byDateDesc(firstStarted),
  released: byNumber((e) => e.year, "desc"),
  "released-asc": byNumber((e) => e.year, "asc"),
  score: byNumber((e) => e.rating, "desc"),
  "score-asc": byNumber((e) => e.rating, "asc"),
};

/** A new, sorted copy of `entries`. */
export function sortEntries(entries: Entry[], key: SortKey): Entry[] {
  return [...entries].sort(COMPARATORS[key]);
}
