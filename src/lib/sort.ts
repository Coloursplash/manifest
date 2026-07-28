// Sort order for the grid, persisted locally. The timeline ignores this — it's
// always date-desc. Entries missing the sort field sort to the end.

import type { Entry } from "./types";

export type SortKey = "title" | "finished" | "released" | "score";

export const SORT_KEYS: SortKey[] = ["title", "finished", "released", "score"];

export const SORT_LABEL: Record<SortKey, string> = {
  title: "Name",
  finished: "Recently finished",
  released: "Recently released",
  score: "My score",
};

const KEY = "manifest-sort";

export function getSort(): SortKey {
  const v = localStorage.getItem(KEY);
  return v && (SORT_KEYS as string[]).includes(v) ? (v as SortKey) : "title";
}

export function setSort(k: SortKey): SortKey {
  localStorage.setItem(KEY, k);
  return k;
}

function byTitle(a: Entry, b: Entry): number {
  return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
}

/** A new, sorted copy of `entries`. */
export function sortEntries(entries: Entry[], key: SortKey): Entry[] {
  const list = [...entries];
  switch (key) {
    case "title":
      list.sort(byTitle);
      break;
    case "finished":
      // Most recently finished first; entries with no finish date sort last.
      list.sort((a, b) => {
        const av = a.finished ?? "";
        const bv = b.finished ?? "";
        if (av !== bv) return av < bv ? 1 : -1;
        return byTitle(a, b);
      });
      break;
    case "released":
      list.sort((a, b) => {
        const av = a.year ?? -Infinity;
        const bv = b.year ?? -Infinity;
        if (av !== bv) return bv - av;
        return byTitle(a, b);
      });
      break;
    case "score":
      list.sort((a, b) => {
        const av = a.rating ?? -Infinity;
        const bv = b.rating ?? -Infinity;
        if (av !== bv) return bv - av;
        return byTitle(a, b);
      });
      break;
  }
  return list;
}
