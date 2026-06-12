"use client";

import { useEffect, useState } from "react";

type StateFilter = "UNREAD" | "ALL" | "READ";
type SourceFilter = "ALL" | "RSS" | "REDDIT" | "YOUTUBE";

/**
 * Manages timeline filter and search state, persisted to sessionStorage.
 */
export function useTimelineFilters() {
  const stateStorageKey = "feedy-timeline-state-v2";
  const sourceStorageKey = "feedy-timeline-source-v2";

  const [stateFilter, setStateFilter] = useState<StateFilter>(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.sessionStorage.getItem(stateStorageKey);
    return saved === "UNREAD" || saved === "ALL" || saved === "READ" ? saved : "ALL";
  });

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => {
    if (typeof window === "undefined") return "ALL";
    const saved = window.sessionStorage.getItem(sourceStorageKey);
    return saved === "ALL" || saved === "RSS" || saved === "REDDIT" || saved === "YOUTUBE" ? saved : "ALL";
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    window.sessionStorage.setItem(stateStorageKey, stateFilter);
    window.sessionStorage.setItem(sourceStorageKey, sourceFilter);
  }, [sourceFilter, stateFilter]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById("timeline-search-input")?.focus();
    });
  }, [searchOpen]);

  const filtersActive = stateFilter !== "ALL" || sourceFilter !== "ALL";
  const timelinePanelOpen = filtersOpen || searchOpen || !!query.trim();

  return {
    stateFilter,
    setStateFilter,
    sourceFilter,
    setSourceFilter,
    filtersOpen,
    setFiltersOpen,
    searchOpen,
    setSearchOpen,
    query,
    setQuery,
    filtersActive,
    timelinePanelOpen,
  };
}

export type { StateFilter, SourceFilter };
