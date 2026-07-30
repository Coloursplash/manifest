import { useEffect } from "react";

// A reusable global keyboard-shortcut hook. Bind a combo like "mod+k" (mod =
// ⌘ on mac, Ctrl elsewhere), "shift+/", or a bare "escape". The handler fires
// on keydown and gets the event so it can preventDefault.
//
//   useHotkey("mod+k", () => setOpen((v) => !v));
//
// By design it ignores keystrokes while the user is typing in an input/textarea/
// contenteditable, unless the combo uses a modifier (so ⌘K still works there).

type Handler = (e: KeyboardEvent) => void;

const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

interface Combo {
  key: string;
  mod: boolean; // ⌘ (mac) / Ctrl (other) — the "mod+" prefix
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

function parse(spec: string): Combo {
  const parts = spec.toLowerCase().split("+").map((p) => p.trim());
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  return {
    key,
    mod: mods.includes("mod"),
    ctrl: mods.includes("ctrl"),
    meta: mods.includes("meta") || mods.includes("cmd"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt") || mods.includes("option"),
  };
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function matches(e: KeyboardEvent, c: Combo): boolean {
  if (e.key.toLowerCase() !== c.key) return false;
  // "mod" resolves to ⌘ on mac / Ctrl elsewhere. Every modifier must match
  // exactly so e.g. plain "escape" doesn't also fire on ⌘+Escape.
  const wantMeta = c.meta || (c.mod && IS_MAC);
  const wantCtrl = c.ctrl || (c.mod && !IS_MAC);
  return (
    e.metaKey === wantMeta &&
    e.ctrlKey === wantCtrl &&
    e.shiftKey === c.shift &&
    e.altKey === c.alt
  );
}

export function useHotkey(spec: string, handler: Handler, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const combo = parse(spec);
    const usesMod = combo.mod || combo.ctrl || combo.meta;
    function onKeyDown(e: KeyboardEvent) {
      if (!usesMod && isTypingTarget(e.target)) return;
      if (matches(e, combo)) handler(e);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [spec, handler, enabled]);
}

// Bind several combos in one listener — handy for a family like the digit keys,
// where a per-key `useHotkey` loop would break the rules of hooks. The handler
// receives the matched spec so it can branch on which key fired.
export function useHotkeys(
  specs: string[],
  handler: (e: KeyboardEvent, spec: string) => void,
  enabled = true,
): void {
  const key = specs.join("|");
  useEffect(() => {
    if (!enabled) return;
    const combos = specs.map((s) => [s, parse(s)] as const);
    function onKeyDown(e: KeyboardEvent) {
      for (const [spec, combo] of combos) {
        const usesMod = combo.mod || combo.ctrl || combo.meta;
        if (!usesMod && isTypingTarget(e.target)) continue;
        if (matches(e, combo)) {
          handler(e, spec);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `key` captures the spec list; handler is deliberately a dep so callers can
    // close over fresh state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handler, enabled]);
}
