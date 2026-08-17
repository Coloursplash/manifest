import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fuzzyMatch } from "../lib/fuzzy";
import type { Command } from "./CommandPalette";
import { IconCheck, IconClose, IconPlus, IconSearch } from "./icons";

// The one floating field that unifies every entry point, VSCode-style:
//   • text        → filter, plus a dropdown of matching entries and an "Add …"
//                   row that expands the SAME field into add mode
//   • leading ">" → command mode: fuzzy-search the command list
//   • add mode    → the field becomes the add search; `renderAdd` fills the
//                   dropdown with the add UI (one input, one joined menu)
// The mode's marker (›, +) shows as the left icon; the trigger char is never
// kept in the text.

export interface OmniBoxHandle {
  focus: () => void;
  commandMode: () => void;
  /** Open add mode, optionally seeded with a title. */
  addMode: (query?: string) => void;
}

const ADD_ID = "__omni_add__";
// Cap rendered rows so each keystroke stays cheap — a huge list (every library
// entry is a command) makes per-key re-renders lag and arrow events pile up.
const MAX_RESULTS = 50;

export const OmniBox = forwardRef<
  OmniBoxHandle,
  {
    filter: string;
    onFilter: (v: string) => void;
    /** Commands for ">" mode. */
    commands: Command[];
    /** Matching entries to jump to, for plain-text mode. */
    filterResults?: (q: string) => Command[];
    /** The add UI, rendered into the dropdown when in add mode. */
    renderAdd?: (query: string, close: () => void) => ReactNode;
    /** Add mode: the field holds focus until you commit the title, so keys the
     *  add panel wants (⏎ to hand over to the results, ⇥ to change category)
     *  are offered here first. Return true to say "consumed"; anything else
     *  falls through to typing and the pill's own Esc/Backspace. */
    onAddKey?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
    /** Report which mode the pill is in, so the app can stand down its
     *  single-key hotkeys while you're adding. */
    onModeChange?: (mode: "filter" | "command" | "add") => void;
    placeholder?: string;
  }
>(function OmniBox(
  {
    filter,
    onFilter,
    commands,
    filterResults,
    renderAdd,
    onAddKey,
    onModeChange,
    placeholder = "Search, or > for commands",
  },
  ref,
) {
  const [mode, setMode] = useState<"filter" | "command" | "add">("filter");
  const [cmd, setCmd] = useState(""); // command query, WITHOUT the ">" prefix
  const [addq, setAddq] = useState(""); // add query
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cmdMode = mode === "command";
  const addModeOn = mode === "add";
  const value = cmdMode ? cmd : addModeOn ? addq : filter;

  const results = useMemo(() => {
    if (cmdMode) {
      const q = cmd.trim();
      if (!q) return commands.slice(0, MAX_RESULTS);
      return commands
        .map((c) => ({
          c,
          m: fuzzyMatch(q, `${c.title} ${c.subtitle ?? ""} ${c.keywords ?? ""}`),
        }))
        .filter((r) => r.m !== null)
        .sort((a, b) => b.m!.score - a.m!.score)
        .slice(0, MAX_RESULTS)
        .map((r) => r.c);
    }
    if (addModeOn) return [] as Command[];
    const q = filter.trim();
    if (!q) return [] as Command[];
    const jumps = filterResults ? filterResults(q) : [];
    // Append the "Add …" row that expands this field into add mode.
    return renderAdd
      ? [
          ...jumps,
          {
            id: ADD_ID,
            title: `Add “${q}”…`,
            group: "New",
            icon: IconPlus({ size: 15 }),
          } as Command,
        ]
      : jumps;
  }, [cmdMode, addModeOn, cmd, commands, filter, filterResults, renderAdd]);

  const panelOpen = addModeOn ? true : focused && (cmdMode || results.length > 0);

  useEffect(() => onModeChange?.(mode), [mode, onModeChange]);

  useEffect(() => {
    setActive((i) => Math.min(Math.max(i, 0), Math.max(results.length - 1, 0)));
  }, [results.length]);
  useEffect(() => setActive(0), [cmd, filter, mode]);

  // Measure the field so the dropdown can be position:fixed (escapes clipping).
  // Add mode gets a wider, clamped panel to fit the cover grid.
  useLayoutEffect(() => {
    if (!panelOpen || !boxRef.current) {
      setPos(null);
      return;
    }
    const r = boxRef.current.getBoundingClientRect();
    if (addModeOn) {
      const w = Math.min(560, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - 12 - w));
      setPos({ top: r.bottom + 6, left, width: w });
    } else {
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
  }, [panelOpen, addModeOn, value]);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  // Add mode: close when clicking anywhere outside the pill + its panel. The
  // panel is a DOM descendant of the box, so contains() covers it too. A
  // listener (not a backdrop element) avoids covering the input.
  useEffect(() => {
    if (!addModeOn) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setMode("filter");
        setAddq("");
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [addModeOn]);

  function enterAdd(query: string) {
    setMode("add");
    setAddq(query);
    onFilter(""); // clear the library filter so the bar is empty on exit
    setFocused(true);
    inputRef.current?.focus();
  }
  function exitAdd() {
    setMode("filter");
    setAddq("");
  }
  function exitCommand() {
    setMode("filter");
    setCmd("");
  }

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    commandMode: () => {
      setMode("command");
      setCmd("");
      setFocused(true);
      inputRef.current?.focus();
    },
    addMode: (query = "") => enterAdd(query),
  }));

  function change(v: string) {
    if (cmdMode) {
      setCmd(v);
      return;
    }
    if (addModeOn) {
      setAddq(v);
      return;
    }
    if (v.startsWith(">")) {
      setMode("command");
      setCmd(v.slice(1));
      return;
    }
    onFilter(v);
  }
  function clear() {
    if (cmdMode) exitCommand();
    else if (addModeOn) setAddq("");
    else onFilter("");
    inputRef.current?.focus();
  }
  function run(c: Command | undefined) {
    if (!c || c.disabled) return;
    if (c.id === ADD_ID) {
      enterAdd(filter.trim());
      return;
    }
    c.perform?.();
    if (cmdMode) {
      exitCommand();
    } else {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (addModeOn) {
      if (onAddKey?.(e)) return;
      if (e.key === "Escape" || (e.key === "Backspace" && addq === "")) {
        e.preventDefault();
        exitAdd();
      }
      return;
    }
    if (cmdMode) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive((i) => (results.length ? (i + 1) % results.length : 0));
          return;
        case "ArrowUp":
          e.preventDefault();
          setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
          return;
        case "Enter":
          e.preventDefault();
          run(results[active]);
          return;
        case "Escape":
          e.preventDefault();
          exitCommand();
          return;
        case "Backspace":
          if (cmd === "") {
            e.preventDefault();
            exitCommand();
          }
          return;
      }
      return;
    }
    // Filter mode.
    switch (e.key) {
      case "ArrowDown":
        if (results.length) {
          e.preventDefault();
          setActive((i) => (i + 1) % results.length);
        }
        return;
      case "ArrowUp":
        if (results.length) {
          e.preventDefault();
          setActive((i) => (i - 1 + results.length) % results.length);
        }
        return;
      case "Enter":
        if (panelOpen && results[active]) {
          e.preventDefault();
          run(results[active]);
        }
        return;
      case "Escape":
        onFilter("");
        e.currentTarget.blur();
        return;
    }
  }

  // Group results in first-seen order, tagging each with its flat index.
  const groups: { name: string | null; items: { cmd: Command; idx: number }[] }[] = [];
  results.forEach((c, idx) => {
    const name = c.group ?? null;
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, items: [] };
      groups.push(g);
    }
    g.items.push({ cmd: c, idx });
  });

  const leftIcon = cmdMode ? (
    <span className="searchbox__chev">›</span>
  ) : addModeOn ? (
    <span className="searchbox__chev searchbox__chev--add">
      <IconPlus size={16} />
    </span>
  ) : (
    <IconSearch size={15} />
  );
  const ph = cmdMode ? "Type a command…" : addModeOn ? "Add a title…" : placeholder;

  return (
    <div className={`searchbox ${cmdMode ? "searchbox--cmd" : ""} ${addModeOn ? "searchbox--add" : ""}`} ref={boxRef}>
      <span className="searchbox__icon">{leftIcon}</span>
      <input
        ref={inputRef}
        className="searchbox__input"
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (cmdMode) exitCommand();
          setFocused(false);
        }}
        placeholder={ph}
        aria-label="Search library or run a command"
        spellCheck={false}
      />
      {cmdMode || addModeOn || value ? (
        <button className="searchbox__clear" onClick={clear} title="Clear" aria-label="Clear">
          <IconClose size={14} />
        </button>
      ) : (
        <kbd className="searchbox__key" aria-hidden="true">
          /
        </kbd>
      )}

      {panelOpen &&
        pos &&
        (addModeOn ? (
          <div
            className="omni__panel omni__panel--add"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {renderAdd?.(addq, exitAdd)}
          </div>
        ) : (
          <div
            className="omni__panel"
            ref={listRef}
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {results.length === 0 && <div className="cmdk__empty">No matching command.</div>}
            {groups.map((g) => (
              <div className="cmdk__group" key={g.name ?? "_"}>
                {g.name && <div className="cmdk__grouplabel">{g.name}</div>}
                {g.items.map(({ cmd: c, idx }) => (
                  <button
                    key={c.id}
                    data-idx={idx}
                    role="option"
                    aria-selected={idx === active}
                    className={`cmdk__item ${idx === active ? "is-active" : ""} ${
                      c.active ? "is-current" : ""
                    }`}
                    onMouseMove={() => setActive(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run(c);
                    }}
                  >
                    <span className="cmdk__check">{c.active && <IconCheck size={13} />}</span>
                    {c.icon && <span className="cmdk__itemicon">{c.icon}</span>}
                    <span className="cmdk__title">{c.title}</span>
                    {c.subtitle && <span className="cmdk__subtitle">{c.subtitle}</span>}
                    <span className="cmdk__spacer" />
                    {c.hint && <kbd className="cmdk__hint">{c.hint}</kbd>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
});
