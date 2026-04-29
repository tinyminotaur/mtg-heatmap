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
import { cn } from "@/lib/utils";

type Props = {
  savedViews: SavedView[];
  activeViewId: string | null;
  queryString: string;
  snapshotQuery: string | null;
  onSelectView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  onSaveActiveView: () => void;
  onDuplicateActiveView: () => void;
  onNewView: () => void;
};

export function SavedViewTabs({
  savedViews,
  activeViewId,
  queryString,
  snapshotQuery,
  onSelectView,
  onDeleteView,
  onRenameView,
  onSaveActiveView,
  onDuplicateActiveView,
  onNewView,
}: Props) {
  const dirty = useMemo(() => {
    if (!activeViewId || snapshotQuery == null) return false;
    return queryString !== snapshotQuery;
  }, [activeViewId, queryString, snapshotQuery]);

  return (
    <div className="flex min-h-9 w-full min-w-0 items-center gap-1">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Saved views"
      >
        {savedViews.map((v) => {
          const selected = activeViewId === v.id;
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
                    {!v.builtIn ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          if (window.confirm(`Delete saved view “${v.name}”?`)) onDeleteView(v.id);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
                          Built-in views cannot be deleted
                        </DropdownMenuItem>
                      </>
                    )}
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
