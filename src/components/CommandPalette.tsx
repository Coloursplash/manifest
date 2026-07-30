import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fuzzyMatch } from "../lib/fuzzy";
import { IconSearch } from "./icons";

// ---------------------------------------------------------------------------
// Generic, domain-agnostic command palette (⌘K). Feed it a flat list of
// `Command`s and it handles search, fuzzy ranking, grouping, keyboard nav, and
// drill-in submenus. It knows nothing about this app — build the command list
// elsewhere (see lib/paletteCommands.ts) and reuse this anywhere.
// ---------------------------------------------------------------------------

export interface Command {
  id: string;
  /** Primary text; also the main thing matched against. */
  title: string;
  /** Secondary text shown after the title. */
  subtitle?: string;
  /** Section heading. Groups render in first-seen order. */
  group?: string;
  /** Extra text folded into the search haystack (aliases, synonyms). */
  keywords?: string;
  icon?: ReactNode;
  /** Right-aligned hint, e.g. a shortcut or "↵". */
  hint?: string;
  disabled?: boolean;
  /** Terminal action. Palette closes afterwards unless `keepOpen`. */
  perform?: () => void | Promise<void>;
  /** Drill into a sub-list instead of acting. Return the child commands. */
  children?: () => Command[] | Promise<Command[]>;
  /** Keep the palette open after `perform` (e.g. a toggle you may hit twice). */
  keepOpen?: boolean;
}

interface Level {
  title: string | null; // breadcrumb label (null = root)
  commands: Command[];
}

export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "Type a command or search…",
  emptyText = "No matches.",
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
  emptyText?: string;
}) {
  // A stack of levels lets a command drill into sub-commands (Switch library…).
  const [stack, setStack] = useState<Level[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const level = stack.length ? stack[stack.length - 1] : null;
  const source = level ? level.commands : commands;

  // Reset transient state whenever the palette (re)opens.
  useEffect(() => {
    if (open) {
      setStack([]);
      setQuery("");
      setActive(0);
    }
  }, [open]);

  // Rank + filter the current level's commands against the query.
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return source.slice();
    return source
      .map((c) => ({
        c,
        m: fuzzyMatch(q, `${c.title} ${c.subtitle ?? ""} ${c.keywords ?? ""}`),
      }))
      .filter((r) => r.m !== null)
      .sort((a, b) => b.m!.score - a.m!.score)
      .map((r) => r.c);
  }, [source, query]);

  // Keep the active index in range as results change.
  useEffect(() => {
    setActive((i) => Math.min(Math.max(i, 0), Math.max(results.length - 1, 0)));
  }, [results.length]);

  const run = useCallback(
    async (cmd: Command) => {
      if (cmd.disabled) return;
      if (cmd.children) {
        const kids = await cmd.children();
        setStack((s) => [...s, { title: cmd.title, commands: kids }]);
        setQuery("");
        setActive(0);
        inputRef.current?.focus();
        return;
      }
      await cmd.perform?.();
      if (!cmd.keepOpen) onClose();
    },
    [onClose],
  );

  const popLevel = useCallback(() => {
    setStack((s) => s.slice(0, -1));
    setQuery("");
    setActive(0);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
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
        if (results[active]) run(results[active]);
        break;
      case "Escape":
        e.preventDefault();
        if (stack.length) popLevel();
        else onClose();
        break;
      case "Backspace":
        // Empty query + drilled in → step back out a level.
        if (!query && stack.length) {
          e.preventDefault();
          popLevel();
        }
        break;
    }
  }

  // Scroll the active row into view as you arrow through.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    // jsdom (tests) has no scrollIntoView — guard so it's a no-op there.
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  // Assign each result its flat index (for arrow-key selection) while walking
  // groups in first-seen order.
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
    <div
      className="cmdk__scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk__head">
          <span className="cmdk__icon">
            <IconSearch size={16} />
          </span>
          {level && (
            <button className="cmdk__crumb" onClick={popLevel} title="Back">
              {level.title}
              <span className="cmdk__crumb-x">×</span>
            </button>
          )}
          <input
            ref={inputRef}
            className="cmdk__input"
            autoFocus
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            aria-label="Command palette search"
          />
          <kbd className="cmdk__esc">esc</kbd>
        </div>

        <div className="cmdk__list" ref={listRef} role="listbox">
          {results.length === 0 && <div className="cmdk__empty">{emptyText}</div>}
          {groups.map((g) => (
            <div className="cmdk__group" key={g.name ?? "_"}>
              {g.name && <div className="cmdk__grouplabel">{g.name}</div>}
              {g.items.map(({ cmd, idx }) => (
                <button
                  key={cmd.id}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === active}
                  className={`cmdk__item ${idx === active ? "is-active" : ""} ${
                    cmd.disabled ? "is-disabled" : ""
                  }`}
                  disabled={cmd.disabled}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => run(cmd)}
                >
                  {cmd.icon && <span className="cmdk__itemicon">{cmd.icon}</span>}
                  <span className="cmdk__title">{cmd.title}</span>
                  {cmd.subtitle && <span className="cmdk__subtitle">{cmd.subtitle}</span>}
                  <span className="cmdk__spacer" />
                  {cmd.children && <span className="cmdk__chev">›</span>}
                  {cmd.hint && <kbd className="cmdk__hint">{cmd.hint}</kbd>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
