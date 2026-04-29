"use client";

import { Check, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SavedView } from "@/lib/saved-views";
import { cn } from "@/lib/utils";

type Props = {
  savedViews: SavedView[];
  activeViewId: string | null;
  /** Current URL query string without leading ? */
  queryString: string;
  onSelectView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  onSaveCurrentView: () => void;
};

export function ViewsSelector({
  savedViews,
  activeViewId,
  queryString,
  onSelectView,
  onDeleteView,
  onRenameView,
  onSaveCurrentView,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const active = savedViews.find((v) => v.id === activeViewId);
  const triggerLabel = active?.name ?? "Views";

  const dirtyActive =
    active &&
    (active.query !== queryString ||
      (activeViewId === "sv-default" && queryString !== ""));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 max-w-[min(100%,14rem)] shrink-0 items-center justify-between gap-1 rounded-md border border-border bg-muted/30 px-2 text-xs font-medium hover:bg-muted/50",
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        {dirtyActive ? (
          <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Unsaved changes" />
        ) : null}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Saved views</DropdownMenuLabel>
        {savedViews.map((v) => (
          <div key={v.id} className="group relative">
            {renamingId === v.id ? (
              <div className="flex gap-1 px-2 py-1">
                <Input
                  className="h-8 text-xs"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onRenameView(v.id, renameDraft.trim() || v.name);
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                />
              </div>
            ) : (
              <DropdownMenuItem
                className="flex items-center justify-between gap-2 pr-8"
                onClick={() => onSelectView(v)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {activeViewId === v.id ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{v.name}</span>
                  {v.isDefault ? (
                    <span className="text-[10px] text-muted-foreground">(default)</span>
                  ) : null}
                </span>
                {!v.builtIn ? (
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      aria-label={`Rename ${v.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenamingId(v.id);
                        setRenameDraft(v.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-muted"
                      aria-label={`Delete ${v.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteView(v.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                ) : null}
              </DropdownMenuItem>
            )}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSaveCurrentView}>+ Save current view…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
