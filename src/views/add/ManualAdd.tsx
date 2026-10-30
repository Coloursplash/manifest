import type { Medium, Status } from "../../lib/types";
import { quickLabel } from "./keys";

/** File the typed title by hand — for when search finds nothing, or the
 *  category's provider needs a key you haven't set. The title is whatever is
 *  in the pill. */
export function ManualAdd({
  medium,
  title,
  added,
  onAdd,
}: {
  medium: Medium;
  title: string;
  added: boolean;
  onAdd: (status: Status) => void;
}) {
  if (added) {
    return (
      <span className="btn" style={{ color: "var(--st-done)" }}>
        ✓ Added
      </span>
    );
  }
  return (
    <div className="row wrap">
      {(["want", "active", "done"] as Status[]).map((s) => (
        <button
          key={s}
          className={`btn ${s === "done" ? "btn--accent" : ""}`}
          onClick={() => onAdd(s)}
          disabled={!title.trim()}
        >
          {quickLabel(medium, s)}
        </button>
      ))}
    </div>
  );
}
