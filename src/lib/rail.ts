// Sidebar rail chrome: whether it's collapsed to icons, and how wide it is when
// it isn't. Persisted locally (it's app chrome, not library data).

import { readPref, writePref } from "./prefs";

const KEY = "manifest-rail-collapsed";
const WIDTH_KEY = "manifest-rail-width";

/** Width of the expanded rail out of the box. */
export const RAIL_WIDTH = 178;
/** Narrowest the expanded rail may be dragged — below this the labels start
 *  ellipsising into uselessness, so we collapse instead (see RAIL_SNAP). */
export const RAIL_MIN_WIDTH = 148;
export const RAIL_MAX_WIDTH = 380;
/** Fixed width of the icons-only rail (mirrors `.rail--collapsed` in CSS: the
 *  rail's inset + a key's inset + border + a 16px glyph, so the icons don't
 *  move sideways when the labels go). */
export const RAIL_COLLAPSED_WIDTH = 71;
/** Drag below this and the rail snaps closed; drag back past it and it reopens. */
export const RAIL_SNAP = 120;

export function clampRailWidth(px: number): number {
  return Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, Math.round(px)));
}

export function getRailCollapsed(): boolean {
  return readPref(KEY) === "1";
}

export function setRailCollapsed(collapsed: boolean): boolean {
  writePref(KEY, collapsed ? "1" : "0");
  return collapsed;
}

/** The stored width, clamped. A missing or junk value reads as the default —
 *  a hand-edited localStorage shouldn't be able to leave the rail unusable. */
export function getRailWidth(): number {
  const raw = Number(readPref(WIDTH_KEY));
  return Number.isFinite(raw) && raw > 0 ? clampRailWidth(raw) : RAIL_WIDTH;
}

export function setRailWidth(px: number): number {
  const w = clampRailWidth(px);
  writePref(WIDTH_KEY, String(w));
  return w;
}
