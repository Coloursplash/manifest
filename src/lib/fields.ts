// Presentation helpers for the generic metadata bag (`extra` on an entry, or a
// search candidate's `fields`). Shared by the detail view and the add-flow
// preview so both label and format keys the same way.

/** Nicer labels for the few keys where the raw slug reads badly. */
const FIELD_LABELS: Record<string, string> = {
  community_score: "Community score",
  episode_duration: "Episode length",
  season_premiere: "Premiere",
};

export function humanizeLabel(key: string): string {
  return (
    FIELD_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
  );
}

export function formatValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (key === "community_score" && typeof value === "number") {
    return `${value} / 100`;
  }
  if ((key === "runtime" || key === "episode_duration") && typeof value === "number") {
    return `${value} min`;
  }
  return `${value}`;
}
