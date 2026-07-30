// Whether the sidebar rail is collapsed to icons only. Persisted locally (it's
// app chrome, not library data).

const KEY = "manifest-rail-collapsed";

export function getRailCollapsed(): boolean {
  return localStorage.getItem(KEY) === "1";
}

export function setRailCollapsed(collapsed: boolean): boolean {
  localStorage.setItem(KEY, collapsed ? "1" : "0");
  return collapsed;
}
