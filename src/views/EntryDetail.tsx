import { useEffect, useMemo, useState } from "react";

import { Cover } from "../components/Cover";
import { appendNote, deleteEntry, patchEntry } from "../lib/api";
import { parseNotes, todayISO } from "../lib/notes";
import {
  MEDIUM_LABEL,
  PROGRESS,
  STATUSES,
  statusLabel,
  type Entry,
  type Status,
} from "../lib/types";

export function EntryDetail({
  entry,
  onBack,
  onChanged,
  onDeleted,
}: {
  entry: Entry;
  onBack: () => void;
  onChanged: (e: Entry) => void;
  onDeleted: () => void;
}) {
  const shape = PROGRESS[entry.medium];
  const totalKey = shape.totalKey;
  const totalRaw = totalKey ? entry.extra?.[totalKey] : undefined;
  const total = typeof totalRaw === "number" ? totalRaw : undefined;

  const blocks = useMemo(() => parseNotes(entry.notes), [entry.notes]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function patch(fields: Record<string, unknown>) {
    const u = await guard(() => patchEntry(entry.id, fields));
    if (u) onChanged(u);
  }

  async function chooseStatus(s: Status) {
    const next = entry.status === s ? null : s; // click active status to clear
    await patch({ status: next });
  }

  async function chooseRating(n: number) {
    await patch({ rating: entry.rating === n ? null : n }); // click same to clear
  }

  async function remove() {
    if (!confirm(`Move "${entry.title}" to the library trash?`)) return;
    const done = await guard(() => deleteEntry(entry.id));
    if (done !== undefined) onDeleted();
  }

  // meta fields = everything in `extra` except the progress total (shown above)
  const extraEntries = Object.entries(entry.extra ?? {}).filter(
    ([k, v]) => k !== totalKey && v !== null && v !== undefined && `${v}` !== "",
  );

  return (
    <div>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn btn--ghost" onClick={onBack}>
          ← Library
        </button>
        <div className="topbar__spacer" />
        <button className="btn btn--ghost" onClick={remove} disabled={busy}>
          Trash
        </button>
      </div>

      <div className="detail">
        <div className="detail__cover">
          <Cover url={entry.cover} title={entry.title} />
          {(entry.tags?.length ?? 0) > 0 && (
            <div className="tags">
              {entry.tags!.map((t) => (
                <span className="tag tag--muted" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="detail__title">{entry.title}</h1>
          <div className="detail__sub">
            {MEDIUM_LABEL[entry.medium]}
            {entry.year ? ` · ${entry.year}` : ""}
          </div>

          {/* status */}
          <div className="tabs" style={{ marginBottom: 12 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`chip ${entry.status === s ? "chip--on" : ""}`}
                onClick={() => chooseStatus(s)}
                disabled={busy}
              >
                <span className={`dot dot--${s}`} />
                {statusLabel(entry.medium, s)}
              </button>
            ))}
          </div>

          {/* rating */}
          <div className="stars" title="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`star ${(entry.rating ?? 0) >= n ? "star--on" : ""}`}
                onClick={() => chooseRating(n)}
              >
                {(entry.rating ?? 0) >= n ? "★" : "☆"}
              </span>
            ))}
          </div>

          {/* progress (skipped for single-sitting media like film) */}
          {!shape.single && (
            <div className="section">
              <div className="section__label">Progress</div>
              <div className="stack">
                <div className="row wrap">
                  <DateField
                    label="Started"
                    value={entry.started}
                    onCommit={(v) => patch({ started: v })}
                  />
                  <DateField
                    label="Finished"
                    value={entry.finished}
                    onCommit={(v) => patch({ finished: v })}
                  />
                  {shape.hasSeason && (
                    <NumberField
                      label="Season"
                      value={entry.season}
                      onCommit={(v) => patch({ season: v })}
                    />
                  )}
                </div>

                {shape.unit && (
                  <div className="progress">
                    <div className="progress__row">
                      <NumberField
                        value={entry.progress}
                        onCommit={(v) => patch({ progress: v })}
                        className="progress__num"
                      />
                      <span className="progress__total">
                        {total ? `/ ${total} ${shape.unit}s` : shape.unit + "s in"}
                      </span>
                    </div>
                    {total && (
                      <div className="progress__bar">
                        <div
                          className="progress__fill"
                          style={{
                            width: `${Math.min(100, ((entry.progress ?? 0) / total) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* metadata */}
          {(extraEntries.length > 0 || entry.rating != null) && (
            <dl className="meta-table">
              {entry.rating != null && (
                <>
                  <dt>Rating</dt>
                  <dd>{entry.rating}</dd>
                </>
              )}
              {extraEntries.map(([k, v]) => (
                <FieldRow key={k} label={k} value={v} />
              ))}
            </dl>
          )}

          <LogForm entry={entry} blocks={blocks} onChanged={onChanged} />
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// --- the notes log + logging form ---

function LogForm({
  entry,
  blocks,
  onChanged,
}: {
  entry: Entry;
  blocks: ReturnType<typeof parseNotes>;
  onChanged: (e: Entry) => void;
}) {
  const reread = entry.medium === "book" || entry.medium === "manga";
  const repeatTag = reread ? "reread" : "rewatch";
  const verb = reread ? "read" : "watched";

  const [date, setDate] = useState(todayISO());
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }
  function toggleTag(t: string) {
    setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  }

  async function log() {
    setBusy(true);
    setError(null);
    try {
      const updated = await appendNote(entry.id, date.trim(), tags, body.trim());
      onChanged(updated);
      setBody("");
      setTags([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notes">
      <div className="section__label">Log</div>

      {blocks.length === 0 && (
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          Nothing logged yet.
        </p>
      )}
      {blocks.map((b, i) => (
        <div
          className={`note-block ${b.body ? "" : "note-block--bare"}`}
          key={i}
        >
          <div className="note-block__head">
            {b.date && <span className="note-block__date">{b.date}</span>}
            {b.rest && <span className="muted" style={{ fontSize: "0.72rem" }}>{b.rest}</span>}
            {b.tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </div>
          {b.body && <div className="note-block__body">{b.body}</div>}
        </div>
      ))}

      <div className="stack" style={{ marginTop: 18 }}>
        <div className="row wrap">
          <input
            className="input"
            style={{ width: 160 }}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className={`chip ${tags.includes(repeatTag) ? "chip--on" : ""}`}
            onClick={() => toggleTag(repeatTag)}
          >
            #{repeatTag}
          </button>
          {tags
            .filter((t) => t !== repeatTag)
            .map((t) => (
              <span
                className="tag tag--removable"
                key={t}
                onClick={() => toggleTag(t)}
                title="remove"
              >
                #{t} ✕
              </span>
            ))}
          <input
            className="input"
            style={{ width: 130 }}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="+ tag"
          />
        </div>

        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Thoughts (optional)"
        />

        <div className="row">
          <button
            className="btn btn--accent btn--lg"
            onClick={() => log()}
            disabled={busy}
            title={
              body.trim()
                ? "Log this date with your note"
                : `Just record that you ${verb} it on this date`
            }
          >
            {body.trim() ? "Log with note" : `Just ${verb} it`}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </div>
    </div>
  );
}

// --- small commit-on-change field helpers ---

function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value?: string;
  onCommit: (v: string | null) => void;
}) {
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      <input
        className="input"
        style={{ width: 150 }}
        type="date"
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value || null)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  className,
}: {
  label?: string;
  value?: number;
  onCommit: (v: number | null) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  useEffect(() => setLocal(value?.toString() ?? ""), [value]);

  function commit() {
    const trimmed = local.trim();
    if (trimmed === "") return onCommit(null);
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n)) onCommit(n);
  }

  const input = (
    <input
      className={`input ${className ?? ""}`}
      style={className ? undefined : { width: 90 }}
      type="number"
      inputMode="numeric"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );

  if (!label) return input;
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      {input}
    </label>
  );
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  const text = Array.isArray(value) ? value.join(", ") : `${value}`;
  return (
    <>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </>
  );
}
