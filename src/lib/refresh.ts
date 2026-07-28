// Re-fetch provider metadata for an existing entry. Only provider-supplied
// fields are patched (summary, crew, genres, totals, …) plus an empty
// year/cover — the user's notes, rating, status, tags, and progress are never
// touched, since those keys are simply not in the patch (see store::patch_entry,
// which also keeps `notes` last).

import { fetchDetails, patchEntry, searchMetadata } from "./api";
import type { Candidate, Entry } from "./types";

/** Pick the search hit that best matches an existing entry. Prefer an exact
 *  (case-insensitive) title match, then the same year, else the top hit — so
 *  refreshing "Attack on Titan" (2013) doesn't grab a later season. */
export function pickBest(
  cands: Candidate[],
  title: string,
  year?: number,
): Candidate | undefined {
  if (cands.length === 0) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const exact = cands.filter((c) => norm(c.title) === norm(title));
  const pool = exact.length ? exact : cands;
  return (year != null && pool.find((c) => c.year === year)) || pool[0];
}

/** Refresh one entry against its provider and return the updated entry.
 *  Throws if no confident match is found. */
export async function refreshEntry(entry: Entry): Promise<Entry> {
  const results = await searchMetadata(entry.medium, entry.title);
  const best = pickBest(results, entry.title, entry.year);
  if (!best) throw new Error(`No metadata match found for “${entry.title}”.`);

  const details = best.reference
    ? await fetchDetails(entry.medium, best.reference).catch(() => ({}))
    : {};
  const patch: Record<string, unknown> = { ...(best.fields ?? {}), ...details };
  if (best.summary) patch.summary = best.summary;
  if (entry.year == null && best.year != null) patch.year = best.year;
  if (!entry.cover && best.cover) patch.cover = best.cover;

  return patchEntry(entry.id, patch);
}
