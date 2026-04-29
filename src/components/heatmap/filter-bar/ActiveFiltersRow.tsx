"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActiveFilterChip } from "@/lib/heatmap/active-filter-chips";

type Props = {
  chips: ActiveFilterChip[];
  onRemove: (chipId: string) => void;
  onClearAll: () => void;
  onSaveView?: () => void;
};

export function ActiveFiltersRow({ chips, onRemove, onClearAll, onSaveView }: Props) {
  if (!chips.length && !onSaveView) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/10 px-2 py-2 sm:px-3">
      <span className="text-[11px] font-medium text-muted-foreground">Filters</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <Badge
            key={c.id}
            variant="secondary"
            className="gap-1 pr-1 font-normal"
          >
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
      <div className="flex shrink-0 items-center gap-1">
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
