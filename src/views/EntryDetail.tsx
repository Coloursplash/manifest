import { useEffect, useMemo, useState } from "react";

import { Cover } from "../components/Cover";
import { IconBack, IconCheck, IconClose, IconEdit, IconPlus, IconTrash } from "../components/icons";
import {
  appendNote,
  deleteEntry,
  deleteNote,
  patchEntry,
  updateNote,
} from "../lib/api";
import { formatValue, humanizeLabel } from "../lib/fields";
import { parseNotes, todayISO, type NoteBlock } from "../lib/notes";
import {
  MEDIUM_LABEL,
  PROGRESS,
  STATUSES,
  statusLabel,
  VERBS,
  type Entry,
  type Medium,
  type Status,
} from "../lib/types";

export function EntryDetail({
  entry,
  onBack,
  onChanged,
  onDeleted,
  showOwned = false,
}: {
  entry: Entry;
  onBack: () => void;
  onChanged: (e: Entry) => void;
  onDeleted: () => void;
  /** Show the Owned toggle — on for media that track ownership (Settings). */
  showOwned?: boolean;
}) {
  const shape = PROGRESS[entry.medium];
  const totalKey = shape.totalKey;
  const totalRaw = totalKey ? entry.extra?.[totalKey] : undefined;
  const total = typeof totalRaw === "number" ? totalRaw : undefined;
  const creator = creatorOf(entry);

  const blocks = useMemo(() => parseNotes(entry.notes), [entry.notes]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const logVerb = VERBS[entry.medium].log;

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
    await patch({ status: entry.status === s ? null : s });
  }

  // Turning ownership off *removes* the key rather than writing `owned = false`
  // — absent already means "not owned", and we'd rather not leave dead keys in
  // the user's file.
  async function toggleOwned() {
    await patch({ owned: entry.owned === true ? null : true });
  }

  async function remove() {
    if (!confirm(`Move "${entry.title}" to the library trash?`)) return;
    // deleteEntry resolves void, so we can't gate on its return — treat "didn't
    // throw" as success and navigate away.
    setBusy(true);
    setError(null);
    try {
      await deleteEntry(entry.id);
      onDeleted();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Summary and genres get their own treatment (a paragraph, chips); the total
  // is already shown in Progress. Everything else falls through to the table.
  const extra = entry.extra ?? {};
  const summary = typeof extra.summary === "string" ? extra.summary : undefined;
  const genres = Array.isArray(extra.genres)
    ? (extra.genres as unknown[]).map(String).filter(Boolean)
    : undefined;
  const hidden = new Set(["summary", "genres", ...(totalKey ? [totalKey] : [])]);
  const detailRows = Object.entries(extra).filter(
    ([k, v]) => !hidden.has(k) && v !== null && v !== undefined && `${v}` !== "",
  );

  return (
    <div>
      <div className="detail__bar">
        <button className="btn btn--ghost" onClick={onBack}>
          <IconBack size={16} /> Library
        </button>
        <div className="topbar__spacer" />
        <button className="btn btn--ghost btn--dim" onClick={remove} disabled={busy}>
          <IconTrash size={16} /> Trash
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
            {[MEDIUM_LABEL[entry.medium], creator, entry.year ? `${entry.year}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>

          {/* status */}
          <div className="tabs" style={{ marginBottom: 14 }}>
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

          {/* ownership — only for media you buy a copy of. Sits on its own row
              so a boolean never reads as a sixth (exclusive) status. */}
          {showOwned && (
            <div className="tabs" style={{ marginBottom: 14 }}>
              <button
                className={`chip ${entry.owned ? "chip--on" : ""}`}
                onClick={toggleOwned}
                disabled={busy}
                aria-pressed={entry.owned === true}
                title={
                  entry.owned
                    ? "You own this — it sits in your Backlog"
                    : "Mark as owned (unowned wants sit in your Wishlist)"
                }
              >
                <IconCheck size={13} /> Owned
              </button>
            </div>
          )}

          {/* rating: 5 half-fillable circles = /10 */}
          <RatingCircles value={entry.rating} onSet={(n) => patch({ rating: n })} />

          {genres && genres.length > 0 && (
            <div className="section">
              <div className="section__label">Genres</div>
              <div className="tags">
                {genres.map((g) => (
                  <span className="tag" key={g}>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="section">
              <div className="section__label">Synopsis</div>
              <Synopsis text={summary} />
            </div>
          )}

          {/* details — author/crew etc. matter more than how far in you are */}
          {detailRows.length > 0 && (
            <div className="section">
              <div className="section__label">Details</div>
              <dl className="meta-table">
                {detailRows.map(([k, v]) => (
                  <FieldRow key={k} label={humanizeLabel(k)} value={formatValue(k, v)} />
                ))}
              </dl>
            </div>
          )}

          {/* Single-sitting media (a film, an album) have no progress to track —
              the dated log block *is* the record. But if a started/finished key
              exists on disk anyway (hand-added, or stamped by the old add flow)
              we have to show it: it puts a row on the timeline, so it must not
              be invisible here. Only rendered when there's something to see. */}
          {shape.single && (entry.started || entry.finished) && (
            <div className="section">
              <div className="section__label">Dates</div>
              <div className="row wrap">
                {entry.started && (
                  <DateField
                    label="Started"
                    value={entry.started}
                    onCommit={(v) => patch({ started: v })}
                  />
                )}
                {entry.finished && (
                  <DateField
                    label="Finished"
                    value={entry.finished}
                    onCommit={(v) => patch({ finished: v })}
                  />
                )}
              </div>
              <p className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
                A {MEDIUM_LABEL[entry.medium].toLowerCase().replace(/s$/, "")} is
                logged by its dated entries below — this date is extra, and shows
                as its own row on the timeline. Clear it if that's not what you
                want.
              </p>
            </div>
          )}

          {/* progress */}
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
                        {total ? `/ ${total} ${shape.unit}s` : `${shape.unit}s in`}
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

          {/* log */}
          <div className="notes">
            <div className="section__label">Log</div>

            {composing ? (
              <NoteEditor
                medium={entry.medium}
                mode="add"
                initial={{ date: todayISO(), tags: [], body: "" }}
                onSubmit={async (d, t, b) => {
                  onChanged(await appendNote(entry.id, d, t, b));
                  setComposing(false);
                }}
                onCancel={() => setComposing(false)}
              />
            ) : (
              <button className="btn btn--accent" onClick={() => setComposing(true)}>
                <IconPlus size={16} /> Log a {logVerb}
              </button>
            )}

            <div style={{ marginTop: 20 }}>
              {blocks.length === 0 && (
                <p className="muted" style={{ fontSize: "0.8rem" }}>
                  Nothing logged yet.
                </p>
              )}
              {blocks.map((b, i) => (
                <NoteItem
                  key={i}
                  entry={entry}
                  block={b}
                  index={i}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// --- rating: five half-fillable circles = /10 ---

function RatingCircles({
  value,
  onSet,
}: {
  value?: number;
  onSet: (n: number | null) => void;
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
      <span className="label">Rating</span>
      <div className="rcircles">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, (shown - (i - 1) * 2) / 2));
          const cls = fill >= 1 ? "rcirc--full" : fill > 0 ? "rcirc--half" : "";
          return (
            <button
              key={i}
              className={`rcirc ${cls} ${hover !== null ? "rcirc--preview" : ""}`}
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
          className="btn btn--ghost btn--icon-sm btn--dim"
          onClick={() => onSet(null)}
          title="Clear rating"
        >
          <IconClose size={15} />
        </button>
      )}
    </div>
  );
}

/** The primary creator for a medium (author / director / studio), from `extra`. */
function creatorOf(entry: Entry): string | undefined {
  const e = entry.extra ?? {};
  const pick = (k: string) =>
    typeof e[k] === "string" && (e[k] as string).trim() ? (e[k] as string) : undefined;
  switch (entry.medium) {
    case "film":
      return pick("director");
    case "book":
    case "manga":
      return pick("author");
    case "tv":
    case "anime":
      return pick("studio") ?? pick("creator");
    case "game":
      return pick("developer");
    case "music":
      return pick("artist");
  }
}

// --- one log entry, with inline edit/delete ---

function NoteItem({
  entry,
  block,
  index,
  onChanged,
}: {
  entry: Entry;
  block: NoteBlock;
  index: number;
  onChanged: (e: Entry) => void;
}) {
  const [editing, setEditing] = useState(false);

  async function del() {
    if (!confirm("Delete this log entry?")) return;
    onChanged(await deleteNote(entry.id, index));
  }

  if (editing) {
    return (
      <NoteEditor
        medium={entry.medium}
        mode="edit"
        initial={{ date: block.date || todayISO(), tags: block.tags, body: block.body }}
        onSubmit={async (d, t, b) => {
          onChanged(await updateNote(entry.id, index, d, t, b));
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`note-block ${block.body ? "" : "note-block--bare"}`}>
      <div className="note-block__head">
        {block.date && <span className="note-block__date">{block.date}</span>}
        {block.rest && (
          <span className="muted" style={{ fontSize: "0.72rem" }}>{block.rest}</span>
        )}
        {block.tags.map((t) => (
          <span className="tag" key={t}>
            {t}
          </span>
        ))}
        <div className="note-block__actions">
          <button
            className="btn btn--ghost btn--icon-sm btn--dim"
            onClick={() => setEditing(true)}
            title="Edit"
          >
            <IconEdit size={15} />
          </button>
          <button
            className="btn btn--ghost btn--icon-sm btn--dim"
            onClick={del}
            title="Delete"
          >
            <IconTrash size={15} />
          </button>
        </div>
      </div>
      {block.body && <div className="note-block__body">{block.body}</div>}
    </div>
  );
}

// --- shared editor for adding + editing a log entry ---

function NoteEditor({
  medium,
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  medium: Medium;
  mode: "add" | "edit";
  initial: { date: string; tags: string[]; body: string };
  onSubmit: (date: string, tags: string[], body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const repeatTag = VERBS[medium].repeat;
  const verb = VERBS[medium].past;

  const [date, setDate] = useState(initial.date);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState(initial.body);
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(date.trim(), tags, body.trim());
      if (mode === "add") {
        setDate(todayISO());
        setTags([]);
        setTagInput("");
        setBody("");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode === "edit" ? "Save" : body.trim() ? "Log with note" : `Just ${verb} it`;

  return (
    <div className={`note-editor stack ${mode === "edit" ? "note-editor--edit" : ""}`}>
      {mode === "edit" && <div className="note-editor__head label">Editing entry</div>}
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
        <button className="btn btn--accent btn--lg" onClick={submit} disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}

// --- small commit-on-change field helpers ---

/** A date + an explicit clear. The × matters: emptying a native date input isn't
 *  reliably possible in the webview, and a wrong date here is not cosmetic — it
 *  puts a row on the timeline. */
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
    <div className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      <div className="row" style={{ gap: 4 }}>
        <input
          className="input"
          style={{ width: 150 }}
          type="date"
          value={value ?? ""}
          aria-label={label}
          onChange={(e) => onCommit(e.target.value || null)}
        />
        {value && (
          <button
            className="btn btn--ghost btn--icon-sm btn--dim"
            onClick={() => onCommit(null)}
            title={`Clear ${label.toLowerCase()} date`}
            aria-label={`Clear ${label}`}
          >
            <IconClose size={15} />
          </button>
        )}
      </div>
    </div>
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

// --- synopsis: clamp long descriptions behind a show-more toggle ---

function Synopsis({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 320;
  return (
    <div className="synopsis">
      <p
        className={`synopsis__text ${
          long && !expanded ? "synopsis__text--clamped" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          className="btn btn--ghost btn--sm synopsis__more"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

