"use client";

import type { HeatmapFilters } from "@/lib/filter-state";
import { rowStatusFromFilters, type RowStatusTab } from "@/lib/heatmap/row-status";
import { cn } from "@/lib/utils";

type Props = {
  filters: HeatmapFilters;
  onTabChange: (tab: RowStatusTab) => void;
  counts?: {
    all: number;
    owned: number;
    wishlist: number;
    none: number;
  };
  loading?: boolean;
};

const TABS: { id: RowStatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "wishlist", label: "Wishlist" },
  { id: "none", label: "None" },
];

export function StatusTabs({ filters, onTabChange, counts, loading }: Props) {
  const cur = rowStatusFromFilters(filters);

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/25 p-0.5"
      role="tablist"
      aria-label="Collection status"
    >
      {TABS.map(({ id, label }) => {
        const active = cur === id;
        const n =
          id === "all"
            ? counts?.all
            : id === "owned"
              ? counts?.owned
              : id === "wishlist"
                ? counts?.wishlist
                : counts?.none;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded px-2 py-1.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
            onClick={() => onTabChange(id)}
          >
            <span>{label}</span>
            {loading ? (
              <span className="ml-1 inline-block h-3 w-8 animate-pulse rounded bg-muted align-middle" />
            ) : n != null ? (
              <span className="ml-1 tabular-nums text-muted-foreground">({n.toLocaleString()})</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
