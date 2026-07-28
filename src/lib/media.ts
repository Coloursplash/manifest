// User-chosen set of enabled media categories. This only governs which category
// tabs the UI surfaces (header filters + the Add flow) — the library on disk is
// untouched, and entries of a hidden medium are never dropped. Persisted in
// localStorage like theme/accent. At least one medium is always enabled.

import { MEDIA, type Medium } from "./types";

const KEY = "manifest-enabled-media";

// The media universe before `known` was tracked (v1.2 and earlier). Used to
// migrate a legacy saved array: any medium introduced *after* this set — games,
// music, and whatever comes next — defaults to enabled rather than staying
// hidden behind a stale saved list. A medium *within* this set keeps its saved
// on/off state, so an intentionally-disabled category stays disabled.
const LEGACY_MEDIA: Medium[] = ["film", "tv", "anime", "book", "manga"];

interface Saved {
  enabled: Medium[];
  /** The full MEDIA set at the time this was written. */
  known: Medium[];
}

/** Enabled media in canonical `MEDIA` order. Falls back to all media. A medium
 *  not present in the saved `known` universe (i.e. added since the last save) is
 *  treated as newly introduced and enabled by default. */
export function getEnabledMedia(): Medium[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [...MEDIA];
  try {
    const parsed = JSON.parse(raw) as unknown;

    let enabled: unknown;
    let known: Medium[];
    if (Array.isArray(parsed)) {
      // Legacy format: a bare enabled-list from before `known` existed.
      enabled = parsed;
      known = LEGACY_MEDIA;
    } else if (parsed && typeof parsed === "object" && "enabled" in parsed) {
      const s = parsed as Partial<Saved>;
      enabled = s.enabled;
      known = Array.isArray(s.known) ? s.known : LEGACY_MEDIA;
    } else {
      return [...MEDIA];
    }
    if (!Array.isArray(enabled)) return [...MEDIA];

    const result = MEDIA.filter(
      (m) => (enabled as unknown[]).includes(m) || !known.includes(m),
    );
    return result.length ? result : [...MEDIA];
  } catch {
    return [...MEDIA];
  }
}

/** Persist and return the normalised list (canonical order, never empty). The
 *  current full MEDIA set is recorded as `known`, so the next medium we add
 *  auto-enables for this user instead of being filtered out. */
export function saveEnabledMedia(media: Medium[]): Medium[] {
  const ordered = MEDIA.filter((m) => media.includes(m));
  const next = ordered.length ? ordered : [...MEDIA];
  const payload: Saved = { enabled: next, known: [...MEDIA] };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return next;
}
