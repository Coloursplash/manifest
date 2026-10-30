import { Dropdown } from "./Dropdown";
import { RailResizer } from "./RailResizer";
import { IconGrid, IconSettings, IconSidebar, IconSort, IconTimeline, MEDIUM_ICON } from "./icons";
import type { Layout } from "../lib/layout";
import { SORT_KEYS, SORT_LABEL, type SortKey } from "../lib/sort";
import { MEDIUM_LABEL, type Medium } from "../lib/types";

/** The left sidebar: medium filters, view + sort, settings. Resizable, and
 *  collapses to icons. Pure markup — App owns all of the state. */
export function Rail({
  collapsed,
  width,
  enabledMedia,
  filterMedium,
  layout,
  sort,
  onLibrary,
  onSelectMedium,
  onChooseLayout,
  onChangeSort,
  onSettings,
  onToggle,
  onWidth,
  onCommitWidth,
  onCollapsed,
}: {
  collapsed: boolean;
  width: number;
  enabledMedia: Medium[];
  filterMedium: Medium | null;
  layout: Layout;
  sort: SortKey;
  /** On the library (not a detail/review page) — only then is a key lit. */
  onLibrary: boolean;
  onSelectMedium: (m: Medium | null) => void;
  onChooseLayout: (l: Layout) => void;
  onChangeSort: (k: SortKey) => void;
  onSettings: () => void;
  onToggle: () => void;
  /** Live width while dragging; `onCommitWidth` on release (persisted). */
  onWidth: (px: number) => void;
  onCommitWidth: (px: number) => void;
  onCollapsed: (collapsed: boolean) => void;
}) {
  return (
    <nav
      className={`rail ${collapsed ? "rail--collapsed" : ""}`}
      style={collapsed ? undefined : { width: width }}
    >
      <div className="rail__scroll">
        <div className="brand">
          <div className="brand__name">
            <span className="brand__full">MANIFEST</span>
            <span className="brand__mark">M</span>
            <span className="dotmark">.</span>
          </div>
          <div className="brand__spec">マニフェスト</div>
        </div>

        <div className="rail__group">
          <div className="rail__legend">Library</div>
          <button
            className={`railkey railkey--icon ${onLibrary && filterMedium === null ? "railkey--on" : ""}`}
            onClick={() => onSelectMedium(null)}
            title="Show all (0)"
          >
            <IconGrid size={16} />
            <span className="railkey__label">All</span>
          </button>
          {enabledMedia.map((m, i) => {
            const Icon = MEDIUM_ICON[m];
            return (
              <button
                key={m}
                className={`railkey railkey--icon ${onLibrary && filterMedium === m ? "railkey--on" : ""}`}
                onClick={() => onSelectMedium(m)}
                title={i < 9 ? `${MEDIUM_LABEL[m]} (${i + 1})` : MEDIUM_LABEL[m]}
              >
                <Icon size={16} />
                <span className="railkey__label">{MEDIUM_LABEL[m]}</span>
              </button>
            );
          })}
        </div>

        <div className="rail__spacer" />

        <div className="rail__group">
          <div className="rail__legend">View</div>
          <button
            className={`railkey railkey--icon ${onLibrary && layout === "grid" ? "railkey--on" : ""}`}
            onClick={() => onChooseLayout("grid")}
            aria-pressed={onLibrary && layout === "grid"}
            title="Grid view (G)"
          >
            <IconGrid size={16} />
            <span className="railkey__label">Grid</span>
          </button>
          <button
            className={`railkey railkey--icon ${onLibrary && layout === "timeline" ? "railkey--on" : ""}`}
            onClick={() => onChooseLayout("timeline")}
            aria-pressed={onLibrary && layout === "timeline"}
            title="Timeline view (T)"
          >
            <IconTimeline size={16} />
            <span className="railkey__label">Timeline</span>
          </button>
          {/* Sort lives here now; timeline ignores it. It keeps its slot when
              the rail collapses (icon-only) — a control that disappears
              reshuffles everything under it. */}
          <div className="rail-sort">
            <Dropdown
              value={sort}
              options={SORT_KEYS.map((k) => ({ value: k, label: SORT_LABEL[k] }))}
              onChange={(k) => onChangeSort(k as SortKey)}
              ariaLabel="Sort"
              leading="Sort"
              compactIcon={<IconSort size={16} />}
              compact={collapsed}
            />
          </div>
        </div>

        <button
          className="railkey railkey--icon rail__settings"
          onClick={onSettings}
          title="Settings (⌘,)"
        >
          <IconSettings size={16} />
          <span className="railkey__label">Settings</span>
        </button>
        <button
          className="railkey railkey--icon rail__collapse"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          // Explicit: collapsed, the label is display:none and the button
          // would otherwise fall back to whatever the tooltip happens to say.
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          <IconSidebar size={16} />
          <span className="railkey__label">Collapse</span>
        </button>
      </div>

      <RailResizer
        width={width}
        collapsed={collapsed}
        onWidth={onWidth}
        onCommit={onCommitWidth}
        onCollapsed={onCollapsed}
      />
    </nav>
  );
}
