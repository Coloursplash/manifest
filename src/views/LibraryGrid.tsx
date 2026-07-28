import { Cover } from "../components/Cover";
import { MEDIUM_LABEL, type Entry } from "../lib/types";

/** The shelf: a responsive grid of covers. */
export function LibraryGrid({
  entries,
  onOpen,
  emptyHint,
}: {
  entries: Entry[];
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="center">
        <p className="muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="grid">
      {entries.map((e) => (
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
            {e.year ? ` · ${e.year}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
