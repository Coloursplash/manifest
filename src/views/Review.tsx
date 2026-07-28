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

/** A summary of one period of logged events, aggregated from the timeline —
 *  a whole year, or a single month when `month` (0-11) is given. Reached from a
 *  year/month header on the timeline. Whole-library, read-only. */
export function Review({
  year,
  month,
  entries,
  onBack,
  onOpen,
}: {
  year: number;
  month?: number;
  entries: Entry[];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const isMonth = month != null;

  const stats = useMemo(() => {
    const events = buildTimeline(entries).filter((e) => {
      if (e.date.slice(0, 4) !== String(year)) return false;
      if (isMonth && Number(e.date.slice(5, 7)) - 1 !== month) return false;
      return true;
    });

    const byMedium = MEDIA.map((m) => ({
      medium: m,
      n: events.filter((e) => e.entry.medium === m).length,
    })).filter((x) => x.n > 0);

    const distinct = new Set(events.map((e) => e.entry.id)).size;

    const rated = events.filter((e) => typeof e.entry.rating === "number");
    const avg = rated.length
      ? rated.reduce((s, e) => s + (e.entry.rating as number), 0) / rated.length
      : null;

    // Activity buckets: months across a year, or days within a month. Keep the
    // titles per bucket so a bar's tooltip can name what was logged.
    const bucketCount = isMonth
      ? new Date(year, (month as number) + 1, 0).getDate()
      : 12;
    const bucketItems: string[][] = Array.from({ length: bucketCount }, () => []);
    for (const e of events) {
      const idx = isMonth
        ? Number(e.date.slice(8, 10)) - 1
        : Number(e.date.slice(5, 7)) - 1;
      if (idx >= 0 && idx < bucketCount) bucketItems[idx].push(e.entry.title);
    }
    const counts = bucketItems.map((b) => b.length);
    const busiest = counts.reduce(
      (best, n, i) => (n > best.n ? { n, i } : best),
      { n: 0, i: -1 },
    );

    // Distinct entries logged in the period, rated first (desc) then by title —
    // so unrated things (e.g. a book with no score) still show up.
    const seen = new Map<string, Entry>();
    for (const e of events) {
      if (!seen.has(e.entry.id)) seen.set(e.entry.id, e.entry);
    }
    const titles = [...seen.values()].sort((a, b) => {
      const ar = a.rating;
      const br = b.rating;
      if (ar != null && br != null && ar !== br) return br - ar;
      if (ar != null && br == null) return -1;
      if (ar == null && br != null) return 1;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });

    return { total: events.length, byMedium, distinct, avg, counts, bucketItems, busiest, titles };
  }, [entries, year, month, isMonth]);

  const maxBucket = Math.max(1, ...stats.counts);
  const periodLabel = isMonth ? `${MONTHS[month as number]} ${year}` : `${year}`;
  const busiestVal =
    stats.busiest.i < 0
      ? "—"
      : isMonth
        ? String(stats.busiest.i + 1)
        : MONTHS[stats.busiest.i];

  return (
    <div className="review">
      <button className="btn btn--ghost btn--sm" onClick={onBack}>
        <IconBack size={14} /> Back
      </button>

      <h1 className="review__title">
        {periodLabel} <span>In Review</span>
      </h1>

      {stats.total === 0 ? (
        <p className="muted">Nothing logged in {periodLabel}.</p>
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
              label={isMonth ? "Busiest day" : "Busiest month"}
              value={busiestVal}
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
            <div className="section__label">
              {isMonth ? "Daily activity" : "Monthly activity"}
            </div>
            <div className={`barchart ${isMonth ? "barchart--dense" : ""}`}>
              {stats.counts.map((n, i) => {
                const label = isMonth ? String(i + 1) : MONTHS[i][0];
                const showLabel = isMonth
                  ? i === 0 || (i + 1) % 5 === 0 || i === stats.counts.length - 1
                  : true;
                const head = isMonth
                  ? `${i + 1} ${MONTHS[month as number]} ${year}`
                  : `${MONTHS[i]} ${year}`;
                const items = stats.bucketItems[i];
                const side =
                  i < 3 ? "start" : i > stats.counts.length - 4 ? "end" : "center";
                return (
                  <div className="barchart__col" key={i}>
                    <div className="barchart__track">
                      <div
                        className={`barchart__bar ${n === 0 ? "is-empty" : ""}`}
                        style={{ height: `${(n / maxBucket) * 100}%` }}
                      />
                    </div>
                    <div className="barchart__label">{showLabel ? label : ""}</div>
                    <div className={`barchart__tip barchart__tip--${side}`} role="tooltip">
                      <div className="barchart__tip-head">{head}</div>
                      {items.length ? (
                        <ul className="barchart__tip-list">
                          {items.map((t, j) => (
                            <li key={j}>{t}</li>
                          ))}
                        </ul>
                      ) : (
                        <div className="barchart__tip-empty">Nothing logged</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {stats.titles.length > 0 && (
            <section className="section">
              <div className="section__label">Titles</div>
              <div className="grid">
                {stats.titles.map((e) => (
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
