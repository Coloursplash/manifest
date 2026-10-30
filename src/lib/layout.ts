// Which library layout is showing — the responsive cover grid or the dated
// timeline. Persisted locally like the theme; grid is the default.

import { readPref, writePref } from "./prefs";

export type Layout = "grid" | "timeline";

const KEY = "manifest-layout";

export function getLayout(): Layout {
  return readPref(KEY) === "timeline" ? "timeline" : "grid";
}

export function setLayout(l: Layout): Layout {
  writePref(KEY, l);
  return l;
}
