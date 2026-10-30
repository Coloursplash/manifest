// Light/dark theme, persisted locally. The CSS keys off `data-theme` on the
// root element; dark is the default.

import { readPref, writePref } from "./prefs";

export type Theme = "dark" | "light";

const KEY = "manifest-theme";

export function getTheme(): Theme {
  return readPref(KEY) === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  writePref(KEY, t);
}

export function initTheme(): Theme {
  const t = getTheme();
  applyTheme(t);
  return t;
}
