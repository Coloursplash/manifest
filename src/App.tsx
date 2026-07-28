import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getLibraryPath,
  hasTmdbKey,
  listEntries,
  onLibraryChanged,
} from "./lib/api";
import { MEDIA, MEDIUM_LABEL, type Entry, type Medium } from "./lib/types";
import { applyTheme, getTheme, type Theme } from "./lib/theme";
import { Onboarding } from "./views/Onboarding";
import { LibraryGrid } from "./views/LibraryGrid";
import { EntryDetail } from "./views/EntryDetail";
import { AddEntryModal } from "./views/AddEntryModal";
import { SettingsModal } from "./views/SettingsModal";

type View = { kind: "grid" } | { kind: "detail"; id: string };

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null | undefined>(
    undefined,
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasKey, setHasKey] = useState(false);

  const [view, setView] = useState<View>({ kind: "grid" });
  const [filterMedium, setFilterMedium] = useState<Medium | null>(null);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme());

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const reload = useCallback(async () => {
    try {
      setEntries(await listEntries());
    } catch {
      /* no library selected yet */
    }
  }, []);

  // Initial load: resolve the library, then entries + key + disk watcher.
  useEffect(() => {
    // In a plain browser there's no Tauri IPC, so this rejects — fall back to
    // the onboarding screen rather than hanging on "loading…".
    getLibraryPath()
      .then((p) => setLibraryPath(p ?? null))
      .catch(() => setLibraryPath(null));
  }, []);

  useEffect(() => {
    if (!libraryPath) return;
    reload();
    hasTmdbKey().then(setHasKey);
    const unlisten = onLibraryChanged(reload);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [libraryPath, reload]);

  const upsert = useCallback((e: Entry) => {
    setEntries((prev) => {
      const next = prev.filter((x) => x.id !== e.id);
      next.push(e);
      next.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterMedium && e.medium !== filterMedium) return false;
      if (!q) return true;
      const hay = [
        e.title,
        e.year ?? "",
        ...(e.tags ?? []),
        ...Object.values(e.extra ?? {}).map((v) => `${v}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filterMedium, query]);

  if (libraryPath === undefined) {
    return <div className="center spinner">loading…</div>;
  }
  if (libraryPath === null) {
    return <Onboarding onChosen={(p) => setLibraryPath(p)} />;
  }

  const selected =
    view.kind === "detail" ? entries.find((e) => e.id === view.id) : undefined;

  return (
    <div className="app">
      <div className="topbar">
        <span className="wordmark">
          manifest<span className="dotmark">.</span>
        </span>
        <div className="tabs">
          <button
            className={`tab ${filterMedium === null ? "tab--on" : ""}`}
            onClick={() => setFilterMedium(null)}
          >
            All
          </button>
          {MEDIA.map((m) => (
            <button
              key={m}
              className={`tab ${filterMedium === m ? "tab--on" : ""}`}
              onClick={() => setFilterMedium(m)}
            >
              {MEDIUM_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="topbar__spacer" />
        <input
          className="input topbar__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search library…"
        />
        <button className="btn btn--accent btn--lg" onClick={() => setShowAdd(true)}>
          + Add
        </button>
        <button
          className="btn btn--icon"
          onClick={toggleTheme}
          title="Toggle light / dark"
        >
          {theme === "dark" ? "☀" : "☽"}
        </button>
        <button
          className="btn btn--icon"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          ⚙
        </button>
      </div>

      <div className="content">
        {view.kind === "grid" || !selected ? (
          <LibraryGrid
            entries={filtered}
            onOpen={(id) => setView({ kind: "detail", id })}
            emptyHint={
              entries.length === 0
                ? "Your library is empty — hit + Add to log something."
                : "Nothing matches that filter."
            }
          />
        ) : (
          <EntryDetail
            entry={selected}
            onBack={() => setView({ kind: "grid" })}
            onChanged={upsert}
            onDeleted={() => {
              setEntries((prev) => prev.filter((e) => e.id !== selected.id));
              setView({ kind: "grid" });
            }}
          />
        )}
      </div>

      {showAdd && (
        <AddEntryModal
          hasKey={hasKey}
          onClose={() => setShowAdd(false)}
          onNeedKey={() => {
            setShowAdd(false);
            setShowSettings(true);
          }}
          onCreated={(e) => upsert(e)}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            hasTmdbKey().then(setHasKey);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
