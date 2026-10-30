import { useEffect, useRef, useState } from "react";

import { searchMetadata } from "../../lib/api";
import type { Candidate, Medium } from "../../lib/types";

const DEBOUNCE_MS = 300;

interface SearchState {
  /** Which category these results are for. */
  medium: Medium | null;
  results: Candidate[];
  searched: boolean;
  loading: boolean;
  error: string | null;
}

const IDLE: SearchState = { medium: null, results: [], searched: false, loading: false, error: null };

/** Provider search for the add flow, debounced as you type.
 *
 *  Only the newest request may land: a slow response for an older query (or
 *  the previous category, after ⇥) is dropped rather than overwriting newer
 *  results. Results are also tagged with their category and hidden the moment
 *  the category changes — so a quick ⏎ right after ⇥ can never file a film
 *  hit as a TV show. `blocked` (a missing API key) means "don't search". */
export function useAddSearch(medium: Medium, query: string, blocked: boolean) {
  const [state, setState] = useState<SearchState>(IDLE);
  const latest = useRef(0);

  useEffect(() => {
    const request = ++latest.current; // anything still in flight is now stale
    const q = query.trim();
    if (!q || blocked) {
      setState(IDLE);
      return;
    }
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const results = await searchMetadata(medium, q);
        if (request === latest.current) {
          setState({ medium, results, searched: true, loading: false, error: null });
        }
      } catch (e) {
        if (request === latest.current) {
          setState({ medium, results: [], searched: true, loading: false, error: String(e) });
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [medium, query, blocked]);

  const current = state.medium === medium;
  return {
    results: current ? state.results : [],
    searched: current && state.searched,
    loading: state.loading,
    error: current ? state.error : null,
  };
}
