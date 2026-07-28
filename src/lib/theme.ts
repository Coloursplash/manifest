// Light/dark theme, persisted locally. The CSS keys off `data-theme` on the
// root element; dark is the default.

export type Theme = "dark" | "light";

const KEY = "manifest-theme";

export function getTheme(): Theme {
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(KEY, t);
}

export function initTheme(): Theme {
  const t = getTheme();
  applyTheme(t);
  return t;
}
