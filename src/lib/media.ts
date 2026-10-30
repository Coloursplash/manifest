// User-chosen set + order of media categories. This governs which category tabs
// the UI surfaces (rail filters + the Add flow) and in what order — the library
// on disk is untouched, and entries of a hidden medium are never dropped.
// Persisted in localStorage like theme/accent. At least one medium is always
// enabled.

import { readPref, writePref } from "./prefs";
import { MEDIA, type Medium } from "./types";

const KEY = "manifest-enabled-media";

// The media universe before `known` was tracked (v1.2 and earlier). Used to
// migrate a legacy saved array: any medium introduced *after* this set — games,
// music, and whatever comes next — defaults to enabled rather than staying
// hidden behind a stale saved list. A medium *within* this set keeps its saved
// on/off state, so an intentionally-disabled category stays disabled.
const LEGACY_MEDIA: Medium[] = ["film", "tv", "anime", "book", "manga"];

interface Saved {
  /** All known media in the user's preferred order. Absent in older saves. */
  order?: Medium[];
  enabled: Medium[];
  /** The full MEDIA set at the time this was written. */
  known: Medium[];
}

export interface MediaState {
  /** Every medium, in the user's order (newly-added ones appended). */
  order: Medium[];
  /** The enabled subset, in `order`. */
  enabled: Medium[];
}

const isMedium = (x: unknown): x is Medium =>
  typeof x === "string" && (MEDIA as string[]).includes(x);

const allOn = (): MediaState => ({ order: [...MEDIA], enabled: [...MEDIA] });

/** Read + normalise the saved state. New media (added since the save) are
 *  appended to the order and default to enabled; order always covers all MEDIA. */
function load(): MediaState {
  const raw = readPref(KEY);
  if (!raw) return allOn();
  try {
    const parsed = JSON.parse(raw) as unknown;

    let enabledRaw: unknown;
    let orderRaw: unknown;
    let known: Medium[];
    if (Array.isArray(parsed)) {
      // Legacy format: a bare enabled-list from before `known`/`order` existed.
      enabledRaw = parsed;
      orderRaw = undefined;
      known = LEGACY_MEDIA;
    } else if (parsed && typeof parsed === "object" && "enabled" in parsed) {
      const s = parsed as Partial<Saved>;
      enabledRaw = s.enabled;
      orderRaw = s.order;
      known = Array.isArray(s.known) ? s.known.filter(isMedium) : LEGACY_MEDIA;
    } else {
      return allOn();
    }
    if (!Array.isArray(enabledRaw)) return allOn();

    // Full order: saved order first (valid only), then any MEDIA not yet listed.
    const order = Array.isArray(orderRaw) ? orderRaw.filter(isMedium) : [];
    for (const m of MEDIA) if (!order.includes(m)) order.push(m);

    // Enabled: saved-enabled ∪ newly-introduced (not in `known`), kept in order.
    const on = new Set((enabledRaw as unknown[]).filter(isMedium));
    for (const m of MEDIA) if (!known.includes(m)) on.add(m);
    const enabled = order.filter((m) => on.has(m));

    return { order, enabled: enabled.length ? enabled : [...MEDIA] };
  } catch {
    return allOn();
  }
}

/** Persist an order + enabled set, normalising both (order covers all MEDIA,
 *  enabled is a non-empty subset in order). Records the current MEDIA set as
 *  `known` so the next medium we add auto-enables for this user. */
function persist(order: Medium[], enabled: Medium[]): MediaState {
  const fullOrder = order.filter(isMedium);
  for (const m of MEDIA) if (!fullOrder.includes(m)) fullOrder.push(m);
  const on = fullOrder.filter((m) => enabled.includes(m));
  const finalEnabled = on.length ? on : [...MEDIA];
  const payload: Saved = {
    order: fullOrder,
    enabled: finalEnabled,
    known: [...MEDIA],
  };
  writePref(KEY, JSON.stringify(payload));
  return { order: fullOrder, enabled: finalEnabled };
}

/** Every medium in the user's order. */
export const getMediaOrder = (): Medium[] => load().order;

/** Enabled media in the user's order. Falls back to all media. */
export const getEnabledMedia = (): Medium[] => load().enabled;

/** Persist a new enabled set (order preserved); returns the enabled list. */
export function saveEnabledMedia(enabled: Medium[]): Medium[] {
  return persist(load().order, enabled).enabled;
}

/** Persist a new full order (enabled membership preserved); returns both, since
 *  reordering also reorders the enabled subset. */
export function saveMediaOrder(order: Medium[]): MediaState {
  return persist(order, load().enabled);
}
