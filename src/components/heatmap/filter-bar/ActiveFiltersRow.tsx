"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActiveFilterChip } from "@/lib/heatmap/active-filter-chips";
import { cn } from "@/lib/utils";

export type ResultStatsSummary = {
  totalMatches: number;
  rowsLoaded: number;
  pageSizeCap: number;
};

type Props = {
  chips: ActiveFilterChip[];
  onRemove: (chipId: string) => void;
  onClearAll: () => void;
  onSaveView?: () => void;
  /** Match count, loaded rows, and page cap — shown above chips when set. */
  statsSummary?: ResultStatsSummary | null;
  className?: string;
};

export function ActiveFiltersRow({
  chips,
  onRemove,
  onClearAll,
  onSaveView,
  statsSummary,
  className,
}: Props) {
  const hasStats = statsSummary != null;
  const show =
    hasStats || chips.length > 0 || Boolean(onSaveView);
  if (!show) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {hasStats ? (
        <p className="text-xs leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{statsSummary.totalMatches.toLocaleString()}</span> match ·{" "}
          <span className="font-medium text-foreground">{statsSummary.rowsLoaded.toLocaleString()}</span> rows · cap{" "}
          <span className="font-mono tabular-nums">{statsSummary.pageSizeCap}</span>
        </p>
      ) : null}

      {chips.length ? (
        <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1 font-normal">
              <span className="max-w-[220px] truncate">{c.label}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted-foreground/20"
                aria-label={`Remove ${c.label}`}
                onClick={() => onRemove(c.id)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        {chips.length ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearAll}>
            Clear all
          </Button>
        ) : null}
        {onSaveView ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onSaveView}>
            Save view
          </Button>
        ) : null}
      </div>
    </div>
  );
}
