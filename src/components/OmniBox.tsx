import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fuzzyMatch } from "../lib/fuzzy";
import type { Command } from "./CommandPalette";
import { IconClose, IconSearch } from "./icons";

// A single centered header field that does double duty, VSCode-style:
//   • normal text  → filters the library (drives the `filter` prop)
//   • leading ">"  → command mode: fuzzy-search the command list in a dropdown
// Command mode is explicit state, and the ">" is represented by the ›-icon on
// the left rather than kept in the text — so the character never doubles up.

export interface OmniBoxHandle {
  focus: () => void;
  /** Focus and drop straight into command mode. */
  commandMode: () => void;
}

export const OmniBox = forwardRef<
  OmniBoxHandle,
  {
    filter: string;
    onFilter: (v: string) => void;
    commands: Command[];
    placeholder?: string;
  }
>(function OmniBox({ filter, onFilter, commands, placeholder = "Search, or > for commands" }, ref) {
  const [mode, setMode] = useState<"filter" | "command">("filter");
  const [cmd, setCmd] = useState(""); // command query, WITHOUT the ">" prefix
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cmdMode = mode === "command";
  const value = cmdMode ? cmd : filter;

  const results = useMemo(() => {
    if (!cmdMode) return [] as Command[];
    const q = cmd.trim();
    if (!q) return commands;
    return commands
      .map((c) => ({
        c,
        m: fuzzyMatch(q, `${c.title} ${c.subtitle ?? ""} ${c.keywords ?? ""}`),
      }))
      .filter((r) => r.m !== null)
      .sort((a, b) => b.m!.score - a.m!.score)
      .map((r) => r.c);
  }, [cmdMode, cmd, commands]);

  useEffect(() => {
    setActive((i) => Math.min(Math.max(i, 0), Math.max(results.length - 1, 0)));
  }, [results.length]);
  useEffect(() => setActive(0), [cmd]);

  // Measure the field so the dropdown can be position:fixed (escapes clipping).
  useLayoutEffect(() => {
    if (cmdMode && boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    } else {
      setPos(null);
    }
  }, [cmdMode, value]);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    commandMode: () => {
      setMode("command");
      setCmd("");
      inputRef.current?.focus();
    },
  }));

  function change(v: string) {
    if (cmdMode) {
      setCmd(v);
      return;
    }
    // A leading ">" from the filter box flips into command mode; the ">" itself
    // is consumed by the mode (shown as the ›-icon), not kept in the text.
    if (v.startsWith(">")) {
      setMode("command");
      setCmd(v.slice(1));
      return;
    }
    onFilter(v);
  }
  function exitCommand() {
    setMode("filter");
    setCmd("");
  }
  function clear() {
    if (cmdMode) exitCommand();
    else onFilter("");
    inputRef.current?.focus();
  }
  function run(cmd: Command | undefined) {
    if (!cmd || cmd.disabled) return;
    cmd.perform?.();
    exitCommand();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (cmdMode) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive((i) => (results.length ? (i + 1) % results.length : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
          break;
        case "Enter":
          e.preventDefault();
          run(results[active]);
          break;
        case "Escape":
          e.preventDefault();
          exitCommand();
          break;
        case "Backspace":
          // Backspacing past an empty query drops the ">" and returns to filter.
          if (cmd === "") {
            e.preventDefault();
            exitCommand();
          }
          break;
      }
      return;
    }
    if (e.key === "Escape") {
      onFilter("");
      e.currentTarget.blur();
    }
  }

  // Group results in first-seen order, tagging each with its flat index.
  const groups: { name: string | null; items: { cmd: Command; idx: number }[] }[] = [];
  results.forEach((cmd, idx) => {
    const name = cmd.group ?? null;
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, items: [] };
      groups.push(g);
    }
    g.items.push({ cmd, idx });
  });

  return (
    <div className={`searchbox ${cmdMode ? "searchbox--cmd" : ""}`} ref={boxRef}>
      <span className="searchbox__icon">
        {cmdMode ? <span className="searchbox__chev">›</span> : <IconSearch size={15} />}
      </span>
      <input
        ref={inputRef}
        className="searchbox__input"
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={cmdMode ? "Type a command…" : placeholder}
        aria-label="Search library or run a command"
        spellCheck={false}
      />
      {cmdMode || value ? (
        <button className="searchbox__clear" onClick={clear} title="Clear" aria-label="Clear">
          <IconClose size={14} />
        </button>
      ) : (
        <kbd className="searchbox__key" aria-hidden="true">
          /
        </kbd>
      )}

      {cmdMode && pos && (
        <>
          <div className="omni__backdrop" onMouseDown={exitCommand} />
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
                {g.items.map(({ cmd, idx }) => (
                  <button
                    key={cmd.id}
                    data-idx={idx}
                    role="option"
                    aria-selected={idx === active}
                    className={`cmdk__item ${idx === active ? "is-active" : ""}`}
                    onMouseMove={() => setActive(idx)}
                    // mousedown (not click) so it fires before the input blurs
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run(cmd);
                    }}
                  >
                    {cmd.icon && <span className="cmdk__itemicon">{cmd.icon}</span>}
                    <span className="cmdk__title">{cmd.title}</span>
                    {cmd.subtitle && <span className="cmdk__subtitle">{cmd.subtitle}</span>}
                    <span className="cmdk__spacer" />
                    {cmd.hint && <kbd className="cmdk__hint">{cmd.hint}</kbd>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
