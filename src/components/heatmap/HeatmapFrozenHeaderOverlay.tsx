"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HEATMAP_HEADER_H } from "@/lib/constants";

type Props = {
  /**
   * Width of the **card name** header cell only (matches `effFrozenColW` in HeatmapGrid),
   * not including the printings rollup column — keeps controls off the edition column headers.
   */
  cardHeaderWidth: number;
  /** e.g. "Lowest price · asc" */
  sortLabel: string;
  onSortClick: () => void;
  sortButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Edition vs rollup mode control; lives in the card header, right of the sort control. */
  editionSlot?: ReactNode;
};

export function HeatmapFrozenHeaderOverlay({
  cardHeaderWidth,
  sortLabel,
  onSortClick,
  sortButtonRef,
  editionSlot,
}: Props) {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-30 flex min-w-0 items-center gap-1 overflow-hidden border-b border-r border-border/80 bg-background/95 px-1.5 py-1 shadow-sm backdrop-blur-sm"
      style={{
        width: cardHeaderWidth,
        minHeight: HEATMAP_HEADER_H,
        maxWidth: cardHeaderWidth,
      }}
    >
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1">
        <Button
          ref={sortButtonRef}
          type="button"
          variant="secondary"
          size="sm"
          className={cn("h-7 min-w-0 max-w-full shrink gap-1 truncate px-2 text-[11px] sm:text-xs")}
          onClick={onSortClick}
          title="Sort rows"
        >
          <span className="min-w-0 truncate">
            Sort: <span className="font-medium text-foreground">{sortLabel}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
        </Button>
      </div>
      {editionSlot ? (
        <div className="pointer-events-auto flex shrink-0 items-center self-center">{editionSlot}</div>
      ) : null}
    </div>
  );
}
