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
import type { SavedView } from "@/lib/saved-views";
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
    wishlist: number;
    pinned: number;
    none: number;
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
  const customViews = useMemo(() => savedViews.filter((v) => !v.builtIn), [savedViews]);
  const activeCustomView = customViews.find((v) => v.id === activeViewId) ?? null;

  const showingStatusTab = activeCustomView == null;
  const dirty = useMemo(() => {
    if (showingStatusTab) return false;
    if (!activeViewId || snapshotQuery == null) return false;
    return queryString !== snapshotQuery;
  }, [showingStatusTab, activeViewId, queryString, snapshotQuery]);

  const systemTabs: { id: RowStatusTab; label: string; count?: number }[] = [
    { id: "all", label: "All", count: statusCounts?.all },
    { id: "owned", label: "Owned", count: statusCounts?.owned },
    { id: "wishlist", label: "Wishlist", count: statusCounts?.wishlist },
    { id: "pinned", label: "Pinned", count: statusCounts?.pinned },
    { id: "none", label: "None", count: statusCounts?.none },
  ];

  return (
    <div className="flex min-h-9 w-full min-w-0 items-center gap-1">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Status and saved views"
      >
        {systemTabs.map((tab) => {
          const selected = showingStatusTab && activeStatusTab === tab.id;
          return (
            <div
              key={`sys-${tab.id}`}
              className={cn(
                "flex shrink-0 items-stretch rounded-md border border-transparent",
                selected && "border-border bg-background shadow-sm",
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
                onClick={() => onSelectStatusTab(tab.id)}
                title={tab.label}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="truncate">{tab.label}</span>
                  {tab.count != null ? (
                    <span className="tabular-nums text-muted-foreground">({tab.count.toLocaleString()})</span>
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
                    aria-label={`${tab.label} options`}
                  >
                    <ChevronDown className="size-3.5 opacity-80" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onClick={onSaveAsCopy}>Save as copy…</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
                      Built-in tab (not renameable)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}

        {customViews.map((v) => {
          const selected = activeCustomView?.id === v.id;
          const tabDirty = selected && dirty;
          return (
            <div
              key={v.id}
              className={cn(
                "flex shrink-0 items-stretch rounded-md border border-transparent",
                selected && "border-border bg-background shadow-sm",
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
                    <DropdownMenuItem onClick={onDuplicateActiveView}>Duplicate</DropdownMenuItem>
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
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 rounded-md"
        title="New saved view"
        aria-label="New saved view"
        onClick={onNewView}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
