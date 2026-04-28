"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HeatmapFilters } from "@/lib/filter-state";
import { defaultHeatmapFilters } from "@/lib/filter-state";
import { parseHeatmapUrlSearchParams, serializeHeatmapUrlParams } from "@/lib/heatmap-url-params";
import { HEATMAP_FILTER_TIPS } from "@/lib/heatmap-filter-tips";
import { FilterFieldTip } from "./FilterFieldTip";

function filtersFromQuery(qs: string): HeatmapFilters {
  return parseHeatmapUrlSearchParams(new URLSearchParams(qs));
}

function applyFilters(onReplaceQuery: (p: URLSearchParams) => void, f: HeatmapFilters) {
  onReplaceQuery(serializeHeatmapUrlParams({ ...defaultHeatmapFilters, ...f }));
}

type Props = {
  queryString: string;
  onReplaceQuery: (params: URLSearchParams) => void;
};

export function HeatmapCardSearch({ queryString, onReplaceQuery }: Props) {
  const applied = useMemo(() => filtersFromQuery(queryString).search, [queryString]);
  const [draft, setDraft] = useState(applied);
  const [hits, setHits] = useState<{ oracle_id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const applySearch = useCallback(
    (q: string) => {
      const base = filtersFromQuery(queryString);
      applyFilters(onReplaceQuery, { ...base, search: q });
    },
    [queryString, onReplaceQuery],
  );

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      const q = draft.trim();
      if (q.length < 2) {
        if (!cancelled) {
          setHits([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      void fetch(`/api/cards/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d: { results: { oracle_id: string; name: string }[] }) => {
          if (!cancelled) setHits(d.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft]);

  return (
    <FilterFieldTip tip={HEATMAP_FILTER_TIPS.sheetSearch}>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Match card name</p>
        <Input
          id="heatmap-card-search-expanded"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applySearch(draft.trim());
          }}
          placeholder="Type 2+ characters — pick a suggestion or Enter to apply"
          autoComplete="off"
          className="text-sm"
        />
        {loading ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
        {hits.length > 0 ? (
          <ul
            className="max-h-48 overflow-y-auto rounded-md border border-border bg-background text-sm shadow-sm"
            role="listbox"
          >
            {hits.map((h) => (
              <li key={h.oracle_id}>
                <button
                  type="button"
                  className="flex w-full px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    applySearch(h.name);
                    setDraft(h.name);
                    setHits([]);
                  }}
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={() => applySearch(draft.trim())}
          >
            Apply filter
          </Button>
          {applied ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setDraft("");
                applySearch("");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </FilterFieldTip>
  );
}
