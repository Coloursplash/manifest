// User-chosen set of enabled media categories. This only governs which category
// tabs the UI surfaces (header filters + the Add flow) — the library on disk is
// untouched, and entries of a hidden medium are never dropped. Persisted in
// localStorage like theme/accent. At least one medium is always enabled.

import { MEDIA, type Medium } from "./types";

const KEY = "manifest-enabled-media";

/** Enabled media in canonical `MEDIA` order. Falls back to all five. */
export function getEnabledMedia(): Medium[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [...MEDIA];
  try {
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return [...MEDIA];
    const filtered = MEDIA.filter((m) => saved.includes(m));
    return filtered.length ? filtered : [...MEDIA];
  } catch {
    return [...MEDIA];
  }
}

/** Persist and return the normalised list (canonical order, never empty). */
export function saveEnabledMedia(media: Medium[]): Medium[] {
  const ordered = MEDIA.filter((m) => media.includes(m));
  const next = ordered.length ? ordered : [...MEDIA];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
