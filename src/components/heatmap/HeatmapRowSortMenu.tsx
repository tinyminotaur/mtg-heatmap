"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { SortSlot } from "@/lib/filter-state";
import { ROW_SORT_OPTIONS } from "@/lib/heatmap/row-sort-menu";
import { cn } from "@/lib/utils";

export type RowSortAnchorRect = { left: number; top: number; width: number; height: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRect: RowSortAnchorRect | null;
  activeKey: SortSlot["key"];
  onPick: (key: SortSlot["key"]) => void;
};

export function HeatmapRowSortMenu({ open, onOpenChange, anchorRect, activeKey, onPick }: Props) {
  const anchorEl =
    anchorRect &&
    ({
      getBoundingClientRect: () =>
        new DOMRect(anchorRect.left, anchorRect.top, anchorRect.width, anchorRect.height),
    } as const);

  if (!anchorEl) return null;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          className="isolate z-[60]"
          side="bottom"
          align="start"
          sideOffset={4}
          anchor={anchorEl}
          positionMethod="fixed"
        >
          <PopoverPrimitive.Popup
            className={cn(
              "max-h-[min(70dvh,420px)] w-[min(calc(100vw-2rem),15rem)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none ring-1 ring-foreground/10",
            )}
          >
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sort rows by
            </p>
            <div role="menu" className="flex flex-col gap-0.5 pb-1">
              {ROW_SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                    activeKey === key && "bg-accent/70 font-medium",
                  )}
                  onClick={() => onPick(key)}
                >
                  <span>{label}</span>
                  {activeKey === key ? (
                    <span className="text-[10px] text-muted-foreground" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
