import type { Command } from "../components/CommandPalette";
import {
  IconPlus,
  IconSettings,
  IconGrid,
  IconTimeline,
  IconSun,
  IconMoon,
  IconFolder,
  IconSearch,
} from "../components/icons";
import type { Library } from "./libraries";
import { SORT_KEYS, SORT_LABEL, type SortKey } from "./sort";
import type { Layout } from "./layout";
import type { Theme } from "./theme";
import { MEDIUM_LABEL, statusLabel, type Entry, type Medium } from "./types";

// Builds the manifest command list from the current app state + handlers. The
// list is flat (no submenus) — that's the right shape for an inline "type >"
// command bar, where you fuzzy-search straight to the leaf action. Kept cheap;
// the whole list is rebuilt on every render.

export interface PaletteContext {
  entries: Entry[];
  enabledMedia: Medium[];
  layout: Layout;
  sort: SortKey;
  theme: Theme;
  libraries: Library[];
  currentLibraryPath: string;
  currentYear: number;

  onAdd: () => void;
  onSettings: () => void;
  onSelectMedium: (m: Medium | null) => void;
  onChooseLayout: (l: Layout) => void;
  onChangeSort: (k: SortKey) => void;
  onChangeTheme: (t: Theme) => void;
  onOpenEntry: (id: string) => void;
  onOpenReview: (year: number) => void;
  onSwitchLibrary: (path: string) => void;
  onBrowseLibrary: () => void;
}

const el = (Icon: (p: { size?: number }) => JSX.Element, size = 15) => Icon({ size });

export function buildCommands(ctx: PaletteContext): Command[] {
  const cmds: Command[] = [];

  // --- Actions ------------------------------------------------------------
  cmds.push(
    {
      id: "action.add",
      title: "Add entry",
      keywords: "new create log track",
      group: "Actions",
      icon: el(IconPlus),
      hint: "N",
      perform: ctx.onAdd,
    },
    {
      id: "action.settings",
      title: "Open settings",
      keywords: "preferences config keys theme accent",
      group: "Actions",
      icon: el(IconSettings),
      hint: "⌘,",
      perform: ctx.onSettings,
    },
    {
      id: "action.review",
      title: `${ctx.currentYear} in review`,
      keywords: "stats summary recap wrapped year",
      group: "Actions",
      icon: el(IconTimeline),
      perform: () => ctx.onOpenReview(ctx.currentYear),
    },
  );

  // --- Views --------------------------------------------------------------
  cmds.push(
    {
      id: "view.grid",
      title: "Grid view",
      group: "View",
      icon: el(IconGrid),
      hint: ctx.layout === "grid" ? "on" : "G",
      perform: () => ctx.onChooseLayout("grid"),
    },
    {
      id: "view.timeline",
      title: "Timeline view",
      group: "View",
      icon: el(IconTimeline),
      hint: ctx.layout === "timeline" ? "on" : "T",
      perform: () => ctx.onChooseLayout("timeline"),
    },
  );
  const nextTheme: Theme = ctx.theme === "dark" ? "light" : "dark";
  cmds.push({
    id: "view.theme",
    title: `Switch to ${nextTheme} theme`,
    group: "View",
    keywords: "dark light appearance",
    icon: el(nextTheme === "dark" ? IconMoon : IconSun),
    perform: () => ctx.onChangeTheme(nextTheme),
  });

  // --- Sort (flattened to one command per key) ---------------------------
  for (const k of SORT_KEYS) {
    cmds.push({
      id: `sort.${k}`,
      title: `Sort: ${SORT_LABEL[k]}`,
      group: "Sort",
      keywords: "order arrange",
      hint: ctx.sort === k ? "on" : undefined,
      perform: () => ctx.onChangeSort(k),
    });
  }

  // --- Filter by medium ---------------------------------------------------
  cmds.push({
    id: "filter.all",
    title: "Show all media",
    group: "Filter",
    icon: el(IconSearch),
    hint: "0",
    perform: () => ctx.onSelectMedium(null),
  });
  ctx.enabledMedia.forEach((m, i) => {
    cmds.push({
      id: `filter.${m}`,
      title: `Show ${MEDIUM_LABEL[m]}`,
      group: "Filter",
      keywords: m,
      hint: i < 9 ? `${i + 1}` : undefined,
      perform: () => ctx.onSelectMedium(m),
    });
  });

  // --- Libraries (flattened) ---------------------------------------------
  for (const l of ctx.libraries.filter((x) => x.path !== ctx.currentLibraryPath)) {
    cmds.push({
      id: `library.${l.path}`,
      title: `Switch to “${l.name}”`,
      subtitle: l.path,
      group: "Library",
      keywords: "folder change open",
      icon: el(IconFolder),
      perform: () => ctx.onSwitchLibrary(l.path),
    });
  }
  cmds.push({
    id: "library.browse",
    title: "Open another folder…",
    group: "Library",
    keywords: "library switch browse",
    icon: el(IconFolder),
    perform: ctx.onBrowseLibrary,
  });

  // --- Jump to an entry ---------------------------------------------------
  for (const e of ctx.entries) {
    cmds.push({
      id: `entry.${e.id}`,
      title: e.title,
      subtitle: e.year
        ? `${MEDIUM_LABEL[e.medium]} · ${e.year}`
        : MEDIUM_LABEL[e.medium],
      group: "Entries",
      keywords: [
        e.medium,
        ...(e.tags ?? []),
        e.status ? statusLabel(e.medium, e.status) : "",
      ].join(" "),
      perform: () => ctx.onOpenEntry(e.id),
    });
  }

  return cmds;
}
