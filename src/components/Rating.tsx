import { useRef, useState } from "react";

import { IconClose } from "./icons";

/** A /10 score as five half-fillable circles: each circle is two real buttons,
 *  the left half scoring odd, the right half even. Hovering previews.
 *
 *  The halves are separate elements on purpose. They used to be one button per
 *  circle that worked out which half you hit from `getBoundingClientRect` — a
 *  measurement, so it couldn't be tested under jsdom (no layout) and odd scores
 *  were unreachable whenever it read the wrong side. Ten explicit targets need
 *  no arithmetic: whatever you click or press is the score you get.
 *
 *  One tab stop, not ten: the button holding the current score is the tabbable
 *  one (the first when unset) and ←/→ walk a point at a time, taking focus with
 *  them; Backspace clears.
 *
 *  Lives here rather than in EntryDetail because the log dialog rates a title at
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
  // Indexed by score − 1, so ←/→ can move focus to the score they just set.
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const tabScore = v || 1;

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next = Math.max(0, Math.min(10, v + step));
      onSet(next || null); // stepping off the bottom clears, never scores 0
      if (next) btns.current[next - 1]?.focus();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      onSet(null);
    }
  }

  return (
    <div className="rating" onMouseLeave={() => setHover(null)}>
      <span className="label">{label}</span>
      <div className="rcircles">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, (shown - (i - 1) * 2) / 2));
          const cls = fill >= 1 ? "rcirc--full" : fill > 0 ? "rcirc--half" : "";
          return (
            <span
              key={i}
              className={`rcirc ${cls} ${hover !== null ? "rcirc--preview" : ""}`}
            >
              {[(i - 1) * 2 + 1, (i - 1) * 2 + 2].map((score) => (
                <button
                  key={score}
                  ref={(el) => {
                    btns.current[score - 1] = el;
                  }}
                  type="button"
                  className="rcirc__half"
                  tabIndex={score === tabScore ? 0 : -1}
                  aria-label={`Rate ${score} out of 10`}
                  onMouseEnter={() => setHover(score)}
                  onClick={() => onSet(score)}
                  onKeyDown={onKeyDown}
                />
              ))}
            </span>
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
