// The library's search box + medium filter, as one pure function.

import type { Entry, Medium } from "./types";

/** Entries of `medium` (or all, when null) whose title, year, tags or
 *  metadata contain `query`, case-insensitively. Order is kept. */
export function filterEntries(entries: Entry[], medium: Medium | null, query: string): Entry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (medium && e.medium !== medium) return false;
    if (!q) return true;
    const hay = [e.title, e.year ?? "", ...(e.tags ?? []), ...Object.values(e.extra ?? {}).map((v) => `${v}`)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
