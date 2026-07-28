import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getLibraryPath,
  hasTmdbKey,
  listEntries,
  onLibraryChanged,
} from "./lib/api";
import { MEDIUM_LABEL, type Entry, type Medium } from "./lib/types";
import { applyTheme, getTheme, type Theme } from "./lib/theme";
import { applyAccent, getAccent } from "./lib/accent";
import { getEnabledMedia, saveEnabledMedia } from "./lib/media";
import { getLayout, setLayout, type Layout } from "./lib/layout";
import { getSort, setSort, sortEntries, SORT_KEYS, SORT_LABEL, type SortKey } from "./lib/sort";
import { buildTimeline } from "./lib/timeline";
import { refreshEntry } from "./lib/refresh";
import { IconPlus, IconSettings } from "./components/icons";
import { Onboarding } from "./views/Onboarding";
import { LibraryGrid } from "./views/LibraryGrid";
import { Timeline } from "./views/Timeline";
import { EntryDetail } from "./views/EntryDetail";
import { AddEntryModal } from "./views/AddEntryModal";
import { SettingsModal } from "./views/SettingsModal";
import { YearInReview } from "./views/YearInReview";

type View =
  | { kind: "grid" }
  | { kind: "detail"; id: string }
  | { kind: "review"; year: number };

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null | undefined>(
    undefined,
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasKey, setHasKey] = useState(false);

  const [view, setView] = useState<View>({ kind: "grid" });
  const [layout, setLayoutState] = useState<Layout>(getLayout());
  const [sort, setSortState] = useState<SortKey>(getSort());
  const [filterMedium, setFilterMedium] = useState<Medium | null>(null);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [accent, setAccent] = useState<string>(getAccent());
  const [enabledMedia, setEnabledMedia] = useState<Medium[]>(getEnabledMedia());

  function changeTheme(t: Theme) {
    applyTheme(t);
    setTheme(t);
  }
  function changeAccent(hex: string) {
    applyAccent(hex);
    setAccent(hex);
  }
  function changeLayout(l: Layout) {
    setLayoutState(setLayout(l));
  }
  function changeSort(k: SortKey) {
    setSortState(setSort(k));
  }
  function toggleMedium(m: Medium) {
    const on = enabledMedia.includes(m);
    if (on && enabledMedia.length === 1) return; // keep at least one enabled
    const nextSet = on
      ? enabledMedia.filter((x) => x !== m)
      : [...enabledMedia, m];
    setEnabledMedia(saveEnabledMedia(nextSet));
    // If we just hid the medium currently filtered, fall back to All.
    if (on && filterMedium === m) setFilterMedium(null);
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

  // Re-fetch metadata for every entry, one at a time (kind to API rate limits).
  // Entries with no confident match are counted as failures and left as-is.
  const refreshAllMetadata = useCallback(
    async (onProgress?: (done: number, total: number) => void) => {
      const list = [...entries];
      let updated = 0;
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        try {
          upsert(await refreshEntry(list[i]));
          updated++;
        } catch {
          failed++;
        }
        onProgress?.(i + 1, list.length);
      }
      return { updated, failed, total: list.length };
    },
    [entries, upsert],
  );

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

  const sorted = useMemo(() => sortEntries(filtered, sort), [filtered, sort]);
  const timelineEvents = useMemo(() => buildTimeline(filtered), [filtered]);

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
        <div className="brand">
          <div className="brand__name">
            MANIFEST<span className="dotmark">.</span>
          </div>
          <div className="brand__spec">マニフェスト</div>
        </div>
        <div className="tabs">
          <button
            className={`tab ${filterMedium === null ? "tab--on" : ""}`}
            onClick={() => setFilterMedium(null)}
          >
            All
          </button>
          {enabledMedia.map((m) => (
            <button
              key={m}
              className={`tab ${filterMedium === m ? "tab--on" : ""}`}
              onClick={() => setFilterMedium(m)}
            >
              {MEDIUM_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="topbar__actions">
          <div className="seg" role="group" aria-label="View">
            <button
              className={`seg__btn ${layout === "grid" ? "seg__btn--on" : ""}`}
              onClick={() => changeLayout("grid")}
            >
              Grid
            </button>
            <button
              className={`seg__btn ${layout === "timeline" ? "seg__btn--on" : ""}`}
              onClick={() => changeLayout("timeline")}
            >
              Timeline
            </button>
          </div>
          {layout === "grid" && (
            <select
              className="select"
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              title="Sort"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          )}
          <input
            className="input topbar__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter library…"
          />
          <button
            className="btn btn--accent btn--lg"
            onClick={() => setShowAdd(true)}
          >
            <IconPlus size={16} /> Add
          </button>
          <button
            className="btn btn--icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <IconSettings />
          </button>
        </div>
      </div>

      <div className="content">
        {view.kind === "review" ? (
          <YearInReview
            year={view.year}
            entries={entries}
            onBack={() => setView({ kind: "grid" })}
            onOpen={(id) => setView({ kind: "detail", id })}
          />
        ) : view.kind === "detail" && selected ? (
          <EntryDetail
            entry={selected}
            onBack={() => setView({ kind: "grid" })}
            onChanged={upsert}
            onDeleted={() => {
              setEntries((prev) => prev.filter((e) => e.id !== selected.id));
              setView({ kind: "grid" });
            }}
          />
        ) : layout === "timeline" ? (
          <Timeline
            events={timelineEvents}
            onOpen={(id) => setView({ kind: "detail", id })}
            onOpenYear={(year) => setView({ kind: "review", year })}
            emptyHint={
              entries.length === 0
                ? "Your library is empty — hit + Add to log something."
                : "Nothing dated to show yet — log a watch/read date on an entry."
            }
          />
        ) : (
          <LibraryGrid
            entries={sorted}
            onOpen={(id) => setView({ kind: "detail", id })}
            emptyHint={
              entries.length === 0
                ? "Your library is empty — hit + Add to log something."
                : "Nothing matches that filter."
            }
          />
        )}
      </div>

      {showAdd && (
        <AddEntryModal
          hasKey={hasKey}
          enabledMedia={enabledMedia}
          initialMedium={filterMedium}
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
          theme={theme}
          onTheme={changeTheme}
          accent={accent}
          onAccent={changeAccent}
          enabledMedia={enabledMedia}
          onToggleMedium={toggleMedium}
          onRefreshAll={refreshAllMetadata}
          hasKey={hasKey}
          onKeyChanged={() => hasTmdbKey().then(setHasKey)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
