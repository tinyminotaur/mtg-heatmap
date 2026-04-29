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
    pinned: number;
    none: number;
  };
  loading?: boolean;
  /** Segmented control with inset selection (filter rail). */
  variant?: "default" | "rail";
};

const TABS: { id: RowStatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "owned", label: "Owned" },
  { id: "wishlist", label: "Wishlist" },
  { id: "pinned", label: "Pinned" },
  { id: "none", label: "None" },
];

export function StatusTabs({ filters, onTabChange, counts, loading, variant = "default" }: Props) {
  const cur = rowStatusFromFilters(filters);

  const rail = variant === "rail";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5",
        rail
          ? "w-full rounded-lg border border-border bg-muted/40 p-1 dark:bg-muted/25"
          : "rounded-md border border-border bg-muted/25 p-0.5",
      )}
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
                : id === "pinned"
                  ? counts?.pinned
                : counts?.none;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md px-3 py-2 text-[11px] font-medium transition-colors",
              rail
                ? active
                  ? "bg-background text-foreground shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                : active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
            onClick={() => onTabChange(id)}
          >
            <span>{label}</span>
            {loading ? (
              <span className="ml-1 inline-block h-3 w-8 animate-pulse rounded bg-muted align-middle" />
            ) : n != null ? (
              <span
                className={cn(
                  "ml-1 tabular-nums",
                  rail && active ? "text-muted-foreground" : "text-muted-foreground",
                )}
              >
                ({n.toLocaleString()})
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
