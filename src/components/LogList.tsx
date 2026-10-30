import { useState } from "react";

import { NoteEditor } from "./NoteEditor";
import { IconEdit, IconTrash } from "./icons";
import { deleteLog, updateLog } from "../lib/api";
import { formatSpan } from "../lib/logs";
import type { Entry, LogEntry } from "../lib/types";

/** An entry's log, oldest first, each with inline edit and delete. */
export function LogList({
  entry,
  onChanged,
}: {
  entry: Entry;
  onChanged: (e: Entry) => void;
}) {
  if (entry.logs.length === 0) {
    return (
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        Nothing logged yet.
      </p>
    );
  }
  return (
    <>
      {entry.logs.map((log) => (
        // Keyed by the log's own id, so an open editor stays on its log when a
        // neighbour is deleted.
        <LogItem key={log.id} entry={entry} log={log} onChanged={onChanged} />
      ))}
    </>
  );
}

function LogItem({
  entry,
  log,
  onChanged,
}: {
  entry: Entry;
  log: LogEntry;
  onChanged: (e: Entry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (!confirm("Delete this log entry?")) return;
    setError(null);
    try {
      onChanged(await deleteLog(log.id));
    } catch (e) {
      setError(String(e));
    }
  }

  if (editing) {
    return (
      <NoteEditor
        medium={entry.medium}
        mode="edit"
        initial={{ date: log.date, end: log.end, tags: log.tags, body: log.body }}
        onSubmit={async (d) => {
          // NoteEditor shows a thrown error itself and stays open.
          onChanged(await updateLog(log.id, d));
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`note-block ${log.body ? "" : "note-block--bare"}`}>
      <div className="note-block__head">
        <span className="note-block__date">{formatSpan(log.date, log.end)}</span>
        {log.tags.map((t) => (
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
      {log.body && <div className="note-block__body">{log.body}</div>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
