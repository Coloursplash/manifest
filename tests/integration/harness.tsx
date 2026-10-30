// Integration harness: mount the REAL <App /> (real views + real lib modules +
// real src/lib/api routing) over a stateful in-memory fake of the Tauri backend.
// Only the disk/network boundary (`invoke`) is faked — everything above it runs
// for real, which is exactly what these tests exercise.
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import App from "../../src/App";
import type { Candidate, CreatePayload, Entry, LogEntry } from "../../src/lib/types";

export interface BackendSeed {
  /** The active library folder. `null` forces onboarding; defaults to "/lib". */
  path?: string | null;
  entries?: Entry[];
  hasTmdbKey?: boolean;
  hasRawgKey?: boolean;
  /** What `search_metadata` returns for any query. */
  candidates?: Candidate[];
  /** Commands that fail (reject) the first time they're called. */
  failOnce?: string[];
}

export interface FakeBackend {
  /** Live store — assert against it after a flow to check what hit "disk". */
  entries: Map<string, Entry>;
  /** Every command that was routed, in order. */
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  callsTo: (cmd: string) => Array<Record<string, unknown>>;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Install a stateful `invoke` implementation and return a handle to its store.
 *  Reinstalls per call so it survives vitest's `restoreMocks` between tests. */
export function installFakeBackend(seed: BackendSeed = {}): FakeBackend {
  const entries = new Map<string, Entry>();
  for (const e of seed.entries ?? []) entries.set(e.id, { ...e });
  const path = seed.path === undefined ? "/lib" : seed.path;
  const calls: FakeBackend["calls"] = [];
  let logSeq = 0;

  const router = (cmd: string, args: Record<string, unknown>): unknown => {
    calls.push({ cmd, args });
    const id = args.id as string;
    switch (cmd) {
      case "get_library_path":
        return path;
      case "choose_library_folder":
        return path;
      case "set_library_folder":
        return [...entries.values()];
      case "list_entries":
        return [...entries.values()];
      case "get_entry":
        return entries.get(id) ?? null;
      case "has_tmdb_key":
        return !!seed.hasTmdbKey;
      case "has_rawg_key":
        return !!seed.hasRawgKey;
      case "set_tmdb_key":
      case "set_rawg_key":
        return null;
      case "patch_entry": {
        const e = entries.get(id)!;
        const next: Entry = { ...e, ...(args.patch as Partial<Entry>) };
        for (const [k, v] of Object.entries(args.patch as Record<string, unknown>)) {
          if (v === null) delete (next as unknown as Record<string, unknown>)[k];
        }
        entries.set(id, next);
        return next;
      }
      case "add_log": {
        const e = entries.get(id)!;
        const log: LogEntry = {
          id: ++logSeq,
          date: args.date as string,
          ...(args.end ? { end: args.end as string } : {}),
          tags: (args.tags as string[]) ?? [],
          body: (args.body as string) ?? "",
        };
        const next: Entry = { ...e, logs: [...e.logs, log] };
        entries.set(id, next);
        return next;
      }
      case "create_entry": {
        const p = args.payload as CreatePayload;
        const slug = slugify(p.title);
        const eid = `${p.medium}/${slug}`;
        const e: Entry = {
          id: eid,
          medium: p.medium,
          slug,
          title: p.title,
          year: p.year,
          cover: p.cover,
          status: p.status,
          logs: [],
          extra: p.fields ?? {},
        };
        entries.set(eid, e);
        return e;
      }
      case "delete_entry":
        entries.delete(id);
        return null;
      case "search_metadata":
        return seed.candidates ?? [];
      case "fetch_details":
        return {};
      case "cache_cover":
        return args.url;
      default:
        return null;
    }
  };

  const failing = new Set(seed.failOnce ?? []);
  vi.mocked(invoke).mockImplementation(((cmd: string, args?: Record<string, unknown>) => {
    if (failing.delete(cmd)) {
      calls.push({ cmd, args: args ?? {} });
      return Promise.reject(`${cmd} failed`);
    }
    return Promise.resolve(router(cmd, args ?? {}));
  }) as typeof invoke);

  return {
    entries,
    calls,
    callsTo: (cmd) => calls.filter((c) => c.cmd === cmd).map((c) => c.args),
  };
}

/** Install the fake backend, then render the real App against it. */
export function renderApp(seed: BackendSeed = {}) {
  const backend = installFakeBackend(seed);
  return { backend, ...render(<App />) };
}
