import { useMemo } from "react";

import { Cover } from "../components/Cover";
import { IconBack } from "../components/icons";
import { MEDIA, MEDIUM_LABEL, type Entry } from "../lib/types";
import { buildTimeline } from "../lib/timeline";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** Format a /10 rating without a trailing ".0". */
function fmtRating(r: number): string {
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

/** A summary of one year of logged events, aggregated from the timeline.
 *  Reached from a year header on the timeline. Read-only over the library. */
export function YearInReview({
  year,
  entries,
  onBack,
  onOpen,
}: {
  year: number;
  entries: Entry[];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const stats = useMemo(() => {
    const events = buildTimeline(entries).filter(
      (e) => e.date.slice(0, 4) === String(year),
    );

    const byMedium = MEDIA.map((m) => ({
      medium: m,
      n: events.filter((e) => e.entry.medium === m).length,
    })).filter((x) => x.n > 0);

    const distinct = new Set(events.map((e) => e.entry.id)).size;

    const rated = events.filter((e) => typeof e.entry.rating === "number");
    const avg = rated.length
      ? rated.reduce((s, e) => s + (e.entry.rating as number), 0) / rated.length
      : null;

    const monthCounts = Array.from({ length: 12 }, (_, i) =>
      events.filter((e) => Number(e.date.slice(5, 7)) - 1 === i).length,
    );
    const busiest = monthCounts.reduce(
      (best, n, i) => (n > best.n ? { n, i } : best),
      { n: 0, i: -1 },
    );

    // Highest-rated distinct entries watched/read this year.
    const seen = new Map<string, Entry>();
    for (const e of events) {
      if (typeof e.entry.rating === "number" && !seen.has(e.entry.id)) {
        seen.set(e.entry.id, e.entry);
      }
    }
    const top = [...seen.values()]
      .sort((a, b) => (b.rating as number) - (a.rating as number))
      .slice(0, 6);

    return { total: events.length, byMedium, distinct, avg, monthCounts, busiest, top };
  }, [entries, year]);

  const maxMonth = Math.max(1, ...stats.monthCounts);

  return (
    <div className="review">
      <button className="btn btn--ghost btn--sm" onClick={onBack}>
        <IconBack size={14} /> Back
      </button>

      <h1 className="review__title">
        {year} <span>In Review</span>
      </h1>

      {stats.total === 0 ? (
        <p className="muted">Nothing logged in {year}.</p>
      ) : (
        <>
          <div className="stat-row">
            <Tile label="Logged" value={stats.total} />
            <Tile label="Titles" value={stats.distinct} />
            <Tile
              label="Avg score"
              value={stats.avg == null ? "—" : `★${fmtRating(stats.avg)}`}
            />
            <Tile
              label="Busiest"
              value={stats.busiest.i >= 0 ? MONTHS[stats.busiest.i] : "—"}
              sub={stats.busiest.i >= 0 ? `${stats.busiest.n} logged` : undefined}
            />
          </div>

          <section className="section">
            <div className="section__label">By medium</div>
            <div className="review__mediums">
              {stats.byMedium.map((x) => (
                <div className="review__medium" key={x.medium}>
                  <span>{MEDIUM_LABEL[x.medium]}</span>
                  <span className="review__medium-n">{x.n}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section__label">Activity</div>
            <div className="barchart">
              {stats.monthCounts.map((n, i) => (
                <div className="barchart__col" key={i} title={`${MONTHS[i]}: ${n}`}>
                  <div className="barchart__track">
                    <div
                      className="barchart__bar"
                      style={{ height: `${(n / maxMonth) * 100}%` }}
                    />
                  </div>
                  <div className="barchart__label">{MONTHS[i][0]}</div>
                </div>
              ))}
            </div>
          </section>

          {stats.top.length > 0 && (
            <section className="section">
              <div className="section__label">Top rated</div>
              <div className="grid">
                {stats.top.map((e) => (
                  <div className="card" key={e.id} onClick={() => onOpen(e.id)}>
                    <Cover url={e.cover} title={e.title}>
                      {e.status && (
                        <span
                          className={`cover__status dot--${e.status}`}
                          title={e.status}
                        />
                      )}
                    </Cover>
                    <div className="card__title">{e.title}</div>
                    <div className="card__meta">
                      {MEDIUM_LABEL[e.medium]}
                      {typeof e.rating === "number" ? ` · ★${fmtRating(e.rating)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}
