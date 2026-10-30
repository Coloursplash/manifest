// Which media track ownership. An entry's `owned` flag only means something for
// media you *buy* a copy of: for those, "want" splits into a **Backlog** (own it,
// haven't played/read it) and a **Wishlist** (don't own it yet). For streaming-ish
// media — films, TV, anime, music — the distinction is noise, so ownership is off
// by default there and the toggle stays hidden until you turn it on in Settings.
//
// This is a UI preference only: the `owned` key in a .toml file is always read and
// always preserved, whether or not its medium is tracked here.

import { readPref, writePref } from "./prefs";
import { MEDIA, type Medium } from "./types";

const KEY = "manifest-owned-media";

/** Media that track ownership out of the box. Games are the case the split was
 *  built for; books are the obvious second (a shelf of unread paperbacks), but
 *  they stay off until asked for — see the default below. */
export const DEFAULT_OWNED_MEDIA: Medium[] = ["game"];

const isMedium = (x: unknown): x is Medium =>
  typeof x === "string" && (MEDIA as string[]).includes(x);

/** Media whose entries show an Owned toggle and split Backlog/Wishlist, in
 *  canonical MEDIA order. Falls back to the default set on anything unreadable. */
export function getOwnedMedia(): Medium[] {
  const raw = readPref(KEY);
  if (raw === null) return [...DEFAULT_OWNED_MEDIA];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_OWNED_MEDIA];
    // An empty saved array is a real choice (ownership off everywhere), not a
    // missing value — only a *malformed* save falls back to the default.
    const on = new Set(parsed.filter(isMedium));
    return MEDIA.filter((m) => on.has(m));
  } catch {
    return [...DEFAULT_OWNED_MEDIA];
  }
}

/** Persist the tracking set (normalised to MEDIA order); returns what was saved. */
export function saveOwnedMedia(media: Medium[]): Medium[] {
  const on = new Set(media.filter(isMedium));
  const next = MEDIA.filter((m) => on.has(m));
  writePref(KEY, JSON.stringify(next));
  return next;
}

/** Flip one medium's ownership tracking on/off; returns the new set. */
export function toggleOwnedMedium(m: Medium): Medium[] {
  const current = getOwnedMedia();
  return saveOwnedMedia(
    current.includes(m) ? current.filter((x) => x !== m) : [...current, m],
  );
}

/** Does this entry count as owned? Absent/non-true means no — you can't own
 *  something you never said you owned. */
export const isOwned = (e: { owned?: boolean }): boolean => e.owned === true;
