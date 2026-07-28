import { Fragment, useMemo } from "react";

import { Cover } from "../components/Cover";
import { MEDIUM_LABEL } from "../lib/types";
import { groupByMonth, type TimelineEvent } from "../lib/timeline";

/** Format a /10 rating without a trailing ".0". */
function fmtRating(r: number): string {
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

/** The diary: dated watch/read events, newest first, split by month & year.
 *  Everything logged on the same day sits side-by-side in that day's row. */
export function Timeline({
  events,
  onOpen,
  onOpenYear,
  onOpenMonth,
  emptyHint,
}: {
  events: TimelineEvent[];
  onOpen: (id: string) => void;
  onOpenYear: (year: number) => void;
  onOpenMonth: (year: number, month: number) => void;
  emptyHint: string;
}) {
  const groups = useMemo(() => groupByMonth(events), [events]);

  if (events.length === 0) {
    return (
      <div className="center">
        <p className="muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {groups.map((g) => (
        <Fragment key={g.key}>
          {g.startsYear && (
            <button className="tl-year" onClick={() => onOpenYear(g.year)}>
              {g.year}
              <span className="tl-year__cta">In review →</span>
            </button>
          )}
          <div className="tl-month">
            <button
              className="tl-month__label"
              onClick={() => onOpenMonth(g.year, g.month)}
              title={`${g.label} in review`}
            >
              {g.label}
            </button>
            <div className="tl-month__counts">
              {g.counts.map((c) => (
                <span key={c.medium}>
                  {c.n} {MEDIUM_LABEL[c.medium]}
                </span>
              ))}
            </div>
          </div>
          {g.days.map((d) => (
            <div className="tl-day" key={d.date}>
              <div className="tl-day__date">
                <span className="tl-day__num">{d.day}</span>
                <span className="tl-day__wd">{d.weekday}</span>
              </div>
              <div className="tl-day__items">
                {d.events.map((ev, i) => (
                  <TimelineCard
                    key={`${ev.entry.id}:${ev.date}:${i}`}
                    ev={ev}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function TimelineCard({
  ev,
  onOpen,
}: {
  ev: TimelineEvent;
  onOpen: (id: string) => void;
}) {
  const { entry } = ev;
  return (
    <div className="card tl-card" onClick={() => onOpen(entry.id)}>
      <Cover url={entry.cover} title={entry.title}>
        {entry.status && (
          <span className={`cover__status dot--${entry.status}`} title={entry.status} />
        )}
        {ev.repeat && (
          <span className="tl-card__repeat" title="repeat">
            ↻
          </span>
        )}
      </Cover>
      <div className="card__title">{entry.title}</div>
      <div className="card__meta">
        {MEDIUM_LABEL[entry.medium]}
        {typeof entry.rating === "number" ? ` · ★${fmtRating(entry.rating)}` : ""}
      </div>
    </div>
  );
}
