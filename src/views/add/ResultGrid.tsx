import type { Ref } from "react";

import { Cover } from "../../components/Cover";
import { statusLabel, type Candidate, type Medium, type Status } from "../../lib/types";
import { quickLabel } from "./keys";

/** Identity of a hit within one result list, for "already added" marks. */
export const hitKey = (i: number, c: Candidate) => `${i}:${c.title}`;

/** The cover grid of search hits. Each card is focusable (out of the tab
 *  order — ⏎ from the title field steps in, the arrows take over) and owns
 *  its keys via `onCardKey`. */
export function ResultGrid({
  gridRef,
  results,
  medium,
  added,
  onCardKey,
  onPreview,
  onAdd,
}: {
  gridRef: Ref<HTMLDivElement>;
  results: Candidate[];
  medium: Medium;
  added: Record<string, Status>;
  onCardKey: (e: React.KeyboardEvent, c: Candidate, key: string, i: number) => void;
  onPreview: (c: Candidate, key: string, i: number) => void;
  onAdd: (c: Candidate, key: string, status: Status, i: number) => void;
}) {
  return (
    <>
      <div className="sgrid" ref={gridRef}>
        {results.map((c, i) => {
          const key = hitKey(i, c);
          const done = added[key];
          const quick = (status: Status) => (e: React.MouseEvent) => {
            e.stopPropagation();
            onAdd(c, key, status, i);
          };
          return (
            <div
              className="scard"
              key={key}
              data-card=""
              tabIndex={-1}
              onKeyDown={(e) => onCardKey(e, c, key, i)}
            >
              <div
                className="scard__cover"
                onClick={() => onPreview(c, key, i)}
                title="View details"
              >
                <Cover url={c.cover} title={c.title}>
                  {done ? (
                    <div className="scard__added">✓ {statusLabel(medium, done)}</div>
                  ) : (
                    <div className="scard__overlay">
                      <button
                        className="btn btn--accent btn--block"
                        tabIndex={-1}
                        onClick={quick("done")}
                      >
                        {quickLabel(medium, "done")}
                      </button>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn--sm btn--block" tabIndex={-1} onClick={quick("want")}>
                          Plan
                        </button>
                        <button className="btn btn--sm btn--block" tabIndex={-1} onClick={quick("active")}>
                          {quickLabel(medium, "active")}
                        </button>
                      </div>
                    </div>
                  )}
                </Cover>
              </div>
              <div className="scard__title scard__title--link" onClick={() => onPreview(c, key, i)}>
                {c.title}
                {c.year ? ` (${c.year})` : ""}
              </div>
              {c.subtitle && <div className="scard__sub">{c.subtitle}</div>}
            </div>
          );
        })}
      </div>

      {/* The grid is driven from the title field, so say how. */}
      {results.length > 0 && (
        <div className="keyhints">
          <Hint keys="⏎" what="Pick a hit, then log it" />
          <Hint keys="←→↑↓" what="Move" />
          <Hint keys="⇧⏎" what="Plan" />
          <Hint keys="⌥⏎" what={quickLabel(medium, "active")} />
          <Hint keys="⌘⏎" what="Details" />
          <Hint keys="esc" what="Back" />
        </div>
      )}
    </>
  );
}

/** One "⏎ Move"-style key legend. */
function Hint({ keys, what }: { keys: string; what: string }) {
  return (
    <span className="keyhint">
      <kbd>{keys}</kbd>
      {what}
    </span>
  );
}
