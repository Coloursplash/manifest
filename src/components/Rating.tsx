import { useState } from "react";

import { IconClose } from "./icons";

/** A /10 score as five half-fillable circles: click the left half of a circle
 *  for the odd value, the right half for the even one. Hovering previews.
 *
 *  Lives here rather than in EntryDetail because the log dialog rates a film at
 *  the moment you log it, the way Letterboxd does. */
export function RatingCircles({
  value,
  onSet,
  label = "Rating",
}: {
  value?: number | null;
  onSet: (n: number | null) => void;
  label?: string;
}) {
  const v = Math.round(value ?? 0);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? v; // preview while hovering

  // Which /10 value a click at this x lands on (left half = half point).
  function valueAt(i: number, e: React.MouseEvent<HTMLButtonElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    return (i - 1) * 2 + (leftHalf ? 1 : 2);
  }

  return (
    <div className="rating" onMouseLeave={() => setHover(null)}>
      <span className="label">{label}</span>
      <div className="rcircles">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, (shown - (i - 1) * 2) / 2));
          const cls = fill >= 1 ? "rcirc--full" : fill > 0 ? "rcirc--half" : "";
          return (
            <button
              key={i}
              type="button"
              className={`rcirc ${cls} ${hover !== null ? "rcirc--preview" : ""}`}
              aria-label={`Rate ${(i - 1) * 2 + 2} out of 10`}
              onMouseMove={(e) => setHover(valueAt(i, e))}
              onClick={(e) => onSet(valueAt(i, e))}
            />
          );
        })}
      </div>
      <span className={`rating__value ${hover !== null ? "rating__value--preview" : ""}`}>
        {shown || "—"}
        <span className="rating__max">/10</span>
      </span>
      {v > 0 && (
        <button
          type="button"
          className="btn btn--ghost btn--icon-sm btn--dim"
          onClick={() => onSet(null)}
          title="Clear rating"
          aria-label="Clear rating"
        >
          <IconClose size={15} />
        </button>
      )}
    </div>
  );
}
