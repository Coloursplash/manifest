// Which library layout is showing — the responsive cover grid or the dated
// timeline. Persisted locally like the theme; grid is the default.

export type Layout = "grid" | "timeline";

const KEY = "manifest-layout";

export function getLayout(): Layout {
  return localStorage.getItem(KEY) === "timeline" ? "timeline" : "grid";
}

export function setLayout(l: Layout): Layout {
  localStorage.setItem(KEY, l);
  return l;
}
