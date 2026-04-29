"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useMemo } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadSavedViewOrder, orderSavedViews, type SavedView } from "@/lib/saved-views";
import type { RowStatusTab } from "@/lib/heatmap/row-status";
import { cn } from "@/lib/utils";

type Props = {
  savedViews: SavedView[];
  activeViewId: string | null;
  queryString: string;
  snapshotQuery: string | null;
  activeStatusTab: RowStatusTab;
  statusCounts?: {
    all: number;
    owned: number;
    watchlist: number;
    pinned: number;
    reserved: number;
  };
  onSelectStatusTab: (tab: RowStatusTab) => void;
  onSelectView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  onSaveActiveView: () => void;
  onSaveAsCopy: () => void;
  onDuplicateActiveView: () => void;
  onNewView: () => void;
};

const LOCKED_TABS: { id: RowStatusTab; label: string; countKey: keyof NonNullable<Props["statusCounts"]> }[] = [
  { id: "all", label: "All", countKey: "all" },
  { id: "pinned", label: "Pinned", countKey: "pinned" },
  { id: "watchlist", label: "Watchlist", countKey: "watchlist" },
  { id: "owned", label: "Owned", countKey: "owned" },
  { id: "reserved", label: "Reserved", countKey: "reserved" },
];

export function SavedViewTabs({
  savedViews,
  activeViewId,
  queryString,
  snapshotQuery,
  activeStatusTab,
  statusCounts,
  onSelectStatusTab,
  onSelectView,
  onDeleteView,
  onRenameView,
  onSaveActiveView,
  onSaveAsCopy,
  onDuplicateActiveView,
  onNewView,
}: Props) {
  const mergedOrder = useMemo(() => {
    const loaded = typeof window !== "undefined" ? loadSavedViewOrder() : [];
    const ids = new Set(savedViews.map((v) => v.id));
    const base = loaded.filter((id) => ids.has(id));
    for (const v of savedViews) {
      if (!base.includes(v.id)) base.push(v.id);
    }
    return base;
  }, [savedViews]);

  const orderedViews = useMemo(() => orderSavedViews(savedViews, mergedOrder), [savedViews, mergedOrder]);

  const activeCustomView = useMemo(
    () => (activeViewId ? orderedViews.find((v) => v.id === activeViewId) ?? null : null),
    [orderedViews, activeViewId],
  );

  const showingStatusTab = activeCustomView == null;
  const dirty = useMemo(() => {
    if (showingStatusTab) return false;
    if (!activeViewId || snapshotQuery == null) return false;
    return queryString !== snapshotQuery;
  }, [showingStatusTab, activeViewId, queryString, snapshotQuery]);

  return (
    <div className="flex min-h-9 w-full min-w-0 items-center gap-1">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Scope and saved views"
      >
        {LOCKED_TABS.map((tab) => {
          const selected = showingStatusTab && activeStatusTab === tab.id;
          const count = statusCounts?.[tab.countKey];
          return (
            <button
              key={`locked-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "max-w-[10rem] shrink-0 truncate rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              onClick={() => onSelectStatusTab(tab.id)}
              title={tab.label}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="truncate">{tab.label}</span>
                {count != null ? (
                  <span className="tabular-nums text-muted-foreground">({count.toLocaleString()})</span>
                ) : null}
              </span>
            </button>
          );
        })}

        {orderedViews.map((v) => {
          const selected = activeCustomView?.id === v.id;
          const tabDirty = selected && dirty;
          return (
            <div
              key={v.id}
              className={cn(
                "flex shrink-0 items-stretch rounded-md",
                selected && "bg-background shadow-sm",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  "max-w-[10rem] truncate rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                  selected ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                onClick={() => onSelectView(v)}
                title={v.name}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="truncate">{v.name}</span>
                  {tabDirty ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-amber-500"
                      title="Unsaved changes"
                      aria-label="Unsaved changes"
                    />
                  ) : null}
                </span>
              </button>
              {selected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "h-full min-h-8 w-8 shrink-0 rounded-l-none rounded-r-md px-0 text-muted-foreground",
                    )}
                    aria-label="View options"
                  >
                    <ChevronDown className="size-3.5 opacity-80" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem disabled={!dirty} onClick={onSaveActiveView}>
                      Save
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const next = window.prompt("Rename view", v.name);
                        if (next != null && next.trim()) onRenameView(v.id, next.trim());
                      }}
                    >
                      Rename…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onSaveAsCopy}>Save as copy…</DropdownMenuItem>
                    <DropdownMenuItem onClick={onDuplicateActiveView}>Duplicate</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`Delete saved view “${v.name}”?`)) onDeleteView(v.id);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          title="New saved view"
          aria-label="New saved view"
          onClick={onNewView}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
