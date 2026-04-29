"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HeatmapFilters } from "@/lib/filter-state";
import { effectiveSortSlots, slotsToPrimarySortString } from "@/lib/filter-state";
import { buildActiveFilterChips } from "@/lib/heatmap/active-filter-chips";
import { rowStatusFromFilters } from "@/lib/heatmap/row-status";

function summarizeFilters(f: HeatmapFilters, visibleColumnCount: number): string[] {
  const lines: string[] = [];
  const chips = buildActiveFilterChips(f);
  for (const c of chips) {
    lines.push(`• ${c.label}`);
  }
  if (!chips.length) lines.push("• No named filters (default scope)");
  lines.push(`• Sort: ${slotsToPrimarySortString(effectiveSortSlots(f))}`);
  lines.push(`• Columns visible (approx): ${visibleColumnCount}`);
  lines.push(`• Status tab: ${rowStatusFromFilters(f)}`);
  return lines;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFilters: HeatmapFilters;
  visibleColumnCount: number;
  onSave: (name: string) => void | Promise<void>;
};

export function SaveViewDialog({
  open,
  onOpenChange,
  currentFilters,
  visibleColumnCount,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const summary = useMemo(
    () => summarizeFilters(currentFilters, visibleColumnCount),
    [currentFilters, visibleColumnCount],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName("");
          queueMicrotask(() => document.getElementById("save-view-name")?.focus());
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save current view</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="save-view-name">Name</Label>
            <Input
              id="save-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Budget White…"
              className="h-9"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">This view includes</p>
            <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
              {summary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onSave(name.trim() || "Untitled view")}
          >
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
