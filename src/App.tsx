import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  chooseLibraryFolder,
  getLibraryPath,
  hasRawgKey,
  hasTmdbKey,
  listEntries,
  onLibraryChanged,
  setLibraryFolder,
} from "./lib/api";
import {
  getLibraries,
  recordLibrary,
  removeLibrary,
  renameLibrary,
  type Library,
} from "./lib/libraries";
import { MEDIUM_LABEL, type Entry, type Medium } from "./lib/types";
import { applyTheme, getTheme, type Theme } from "./lib/theme";
import { applyAccent, getAccent } from "./lib/accent";
import {
  getEnabledMedia,
  getMediaOrder,
  saveEnabledMedia,
  saveMediaOrder,
} from "./lib/media";
import { getLayout, setLayout, type Layout } from "./lib/layout";
import { getSort, setSort, sortEntries, SORT_KEYS, SORT_LABEL, type SortKey } from "./lib/sort";
import { buildTimeline } from "./lib/timeline";
import { refreshEntry } from "./lib/refresh";
import { IconGrid, IconPlus, IconSettings, IconTimeline } from "./components/icons";
import { Dropdown } from "./components/Dropdown";
import { OmniBox, type OmniBoxHandle } from "./components/OmniBox";
import { buildCommands } from "./lib/paletteCommands";
import { useHotkey, useHotkeys } from "./lib/useHotkey";
import { Onboarding } from "./views/Onboarding";
import { LibraryGrid } from "./views/LibraryGrid";
import { Timeline } from "./views/Timeline";
import { EntryDetail } from "./views/EntryDetail";
import { AddEntryModal } from "./views/AddEntryModal";
import { SettingsModal } from "./views/SettingsModal";
import { Review } from "./views/Review";

type View =
  | { kind: "grid" }
  | { kind: "detail"; id: string }
  | { kind: "review"; year: number; month?: number };

export default function App() {
  const [libraryPath, setLibraryPath] = useState<string | null | undefined>(
    undefined,
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [hasRawg, setHasRawg] = useState(false);
  const [libraries, setLibraries] = useState<Library[]>(getLibraries());

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
  const [mediaOrder, setMediaOrder] = useState<Medium[]>(getMediaOrder());
  const omniRef = useRef<OmniBoxHandle>(null);

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
  // Rail nav: picking a medium or a layout always drops you back onto the
  // library (out of a detail/review page) so the click has a visible effect.
  function selectMedium(m: Medium | null) {
    setFilterMedium(m);
    setView({ kind: "grid" });
  }
  function chooseLayout(l: Layout) {
    changeLayout(l);
    setView({ kind: "grid" });
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
  // Reordering the categories also reorders the enabled subset, so take both.
  function reorderMedia(order: Medium[]) {
    const next = saveMediaOrder(order);
    setMediaOrder(next.order);
    setEnabledMedia(next.enabled);
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
    setLibraries(recordLibrary(libraryPath)); // most-recently-used, keep nickname
    reload();
    hasTmdbKey().then(setHasKey);
    hasRawgKey().then(setHasRawg);
    const unlisten = onLibraryChanged(reload);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [libraryPath, reload]);

  // Drop any open detail/filter, then point at `path` — the effect above
  // reloads its entries, keys and disk watcher and records it as most-recent.
  const finalizeSwitch = useCallback((path: string) => {
    setView({ kind: "grid" });
    setFilterMedium(null);
    setQuery("");
    setShowSettings(false);
    setLibraryPath(path);
  }, []);

  // Jump to a known recent folder (activates it on the backend by path). If it's
  // gone (moved/deleted), drop it from the list rather than resurrecting it.
  const switchToLibrary = useCallback(
    async (path: string) => {
      try {
        await setLibraryFolder(path);
        finalizeSwitch(path);
      } catch {
        setLibraries(removeLibrary(path));
      }
    },
    [finalizeSwitch],
  );

  // Native picker → the chosen folder is already activated on the backend.
  const browseForLibrary = useCallback(async () => {
    const path = await chooseLibraryFolder();
    if (path) finalizeSwitch(path);
  }, [finalizeSwitch]);

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

  // --- Global hotkeys -----------------------------------------------------
  // Single-key shortcuts only fire when you're NOT typing in a field (the hook
  // ignores keystrokes without a modifier while an input is focused), so they
  // never clash with the search box. Every handler preventDefaults so the key
  // can't leak into a field that opens focused (e.g. the Add modal). ⌘-combos
  // work everywhere.

  // ⌘K — focus the search box in ">" command mode.
  useHotkey("mod+k", (e) => {
    e.preventDefault();
    omniRef.current?.commandMode();
  });
  // g / t — jump between grid and timeline layouts.
  useHotkey("g", (e) => {
    e.preventDefault();
    chooseLayout("grid");
  });
  useHotkey("t", (e) => {
    e.preventDefault();
    chooseLayout("timeline");
  });
  // n — new entry. ⌘, — settings (mac convention).
  useHotkey("n", (e) => {
    e.preventDefault();
    setShowAdd(true);
  });
  useHotkey("mod+,", (e) => {
    e.preventDefault();
    setShowSettings(true);
  });
  // / — focus the search box.
  useHotkey("/", (e) => {
    e.preventDefault();
    omniRef.current?.focus();
  });
  // Escape — step back out of a detail/review page, else clear the filter.
  useHotkey(
    "escape",
    () => {
      if (view.kind !== "grid") setView({ kind: "grid" });
      else if (query) setQuery("");
    },
    !showAdd && !showSettings,
  );
  // 0 = All, 1–9 = the nth enabled medium in the rail.
  useHotkeys(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], (e, spec) => {
    e.preventDefault();
    if (spec === "0") {
      selectMedium(null);
      return;
    }
    const m = enabledMedia[Number(spec) - 1];
    if (m) selectMedium(m);
  });

  const commands = useMemo(
    () =>
      buildCommands({
        entries,
        enabledMedia,
        layout,
        sort,
        theme,
        libraries,
        currentLibraryPath: libraryPath ?? "",
        currentYear: new Date().getFullYear(),
        onAdd: () => setShowAdd(true),
        onSettings: () => setShowSettings(true),
        onSelectMedium: selectMedium,
        onChooseLayout: chooseLayout,
        onChangeSort: changeSort,
        onChangeTheme: changeTheme,
        onOpenEntry: (id) => setView({ kind: "detail", id }),
        onOpenReview: (year) => setView({ kind: "review", year }),
        onSwitchLibrary: switchToLibrary,
        onBrowseLibrary: browseForLibrary,
      }),
    // Handlers close over only stable setters, so state values are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, enabledMedia, layout, sort, theme, libraries, libraryPath],
  );

  if (libraryPath === undefined) {
    return <div className="center spinner">loading…</div>;
  }
  if (libraryPath === null) {
    return (
      <Onboarding
        onComplete={(p) => setLibraryPath(p)}
        mediaOrder={mediaOrder}
        enabledMedia={enabledMedia}
        onToggleMedium={toggleMedium}
        onReorderMedia={reorderMedia}
      />
    );
  }

  const selected =
    view.kind === "detail" ? entries.find((e) => e.id === view.id) : undefined;

  const onLibrary = view.kind === "grid";

  return (
    <div className="app">
      <nav className="rail">
        <div className="brand">
          <div className="brand__name">
            MANIFEST<span className="dotmark">.</span>
          </div>
          <div className="brand__spec">マニフェスト</div>
        </div>

        <div className="rail__group">
          <div className="rail__legend">Library</div>
          <button
            className={`railkey ${onLibrary && filterMedium === null ? "railkey--on" : ""}`}
            onClick={() => selectMedium(null)}
            title="Show all (0)"
          >
            All
          </button>
          {enabledMedia.map((m, i) => (
            <button
              key={m}
              className={`railkey ${onLibrary && filterMedium === m ? "railkey--on" : ""}`}
              onClick={() => selectMedium(m)}
              title={i < 9 ? `${MEDIUM_LABEL[m]} (${i + 1})` : MEDIUM_LABEL[m]}
            >
              {MEDIUM_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="rail__spacer" />

        <div className="rail__group">
          <div className="rail__legend">View</div>
          <button
            className={`railkey railkey--icon ${onLibrary && layout === "grid" ? "railkey--on" : ""}`}
            onClick={() => chooseLayout("grid")}
            aria-pressed={onLibrary && layout === "grid"}
            title="Grid view (G)"
          >
            <IconGrid size={16} /> Grid
          </button>
          <button
            className={`railkey railkey--icon ${onLibrary && layout === "timeline" ? "railkey--on" : ""}`}
            onClick={() => chooseLayout("timeline")}
            aria-pressed={onLibrary && layout === "timeline"}
            title="Timeline view (T)"
          >
            <IconTimeline size={16} /> Timeline
          </button>
        </div>

        <button
          className="railkey railkey--icon rail__settings"
          onClick={() => setShowSettings(true)}
          title="Settings (⌘,)"
        >
          <IconSettings size={16} /> Settings
        </button>
      </nav>

      <div className="main">
        <div className="topbar">
          {/* Left gutter + right actions carry equal flex, so the search box
              sits dead-centre regardless of how wide the right cluster gets. */}
          <div className="topbar__gutter" />

          <OmniBox
            ref={omniRef}
            filter={query}
            onFilter={setQuery}
            commands={commands}
          />

          <div className="topbar__actions">
            {/* Always present so switching layout never shifts the row. Timeline
                is always date-descending, so Sort only bites in the grid — it
                just governs grid order quietly while you're on the timeline. */}
            <Dropdown
              value={sort}
              options={SORT_KEYS.map((k) => ({ value: k, label: SORT_LABEL[k] }))}
              onChange={(k) => changeSort(k as SortKey)}
              align="right"
              ariaLabel="Sort"
              leading="Sort"
            />
            <button
              className="btn btn--accent btn--lg"
              onClick={() => setShowAdd(true)}
              title="Add entry (N)"
            >
              <IconPlus size={16} /> Add
            </button>
          </div>
        </div>

        <div className="content">
        {view.kind === "review" ? (
          <Review
            year={view.year}
            month={view.month}
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
            onOpenMonth={(year, month) => setView({ kind: "review", year, month })}
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
      </div>

      {showAdd && (
        <AddEntryModal
          hasKey={hasKey}
          hasRawgKey={hasRawg}
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
          libraryPath={libraryPath}
          libraries={libraries}
          onSwitchTo={switchToLibrary}
          onBrowseLibrary={browseForLibrary}
          onRenameLibrary={(path, name) => setLibraries(renameLibrary(path, name))}
          onRemoveLibrary={(path) => setLibraries(removeLibrary(path))}
          theme={theme}
          onTheme={changeTheme}
          accent={accent}
          onAccent={changeAccent}
          mediaOrder={mediaOrder}
          enabledMedia={enabledMedia}
          onToggleMedium={toggleMedium}
          onReorderMedia={reorderMedia}
          onRefreshAll={refreshAllMetadata}
          hasKey={hasKey}
          onKeyChanged={() => hasTmdbKey().then(setHasKey)}
          hasRawgKey={hasRawg}
          onRawgKeyChanged={() => hasRawgKey().then(setHasRawg)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
