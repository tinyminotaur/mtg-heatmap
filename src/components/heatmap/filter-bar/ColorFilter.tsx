"use client";

import type { ColorMatchMode } from "@/lib/filter-state";
import { cn } from "@/lib/utils";

const WUBRG = ["W", "U", "B", "R", "G"] as const;

type Props = {
  selected: string[];
  onChange: (colors: string[]) => void;
  mode: ColorMatchMode;
  onModeChange: (mode: ColorMatchMode) => void;
};

export function ColorFilter({ selected, onChange, mode, onModeChange }: Props) {
  const setSel = new Set(selected);

  const toggle = (c: string) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange([...next].sort());
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-1 py-0.5">
      <div className="flex items-center gap-0.5">
        {WUBRG.map((c) => {
          const on = setSel.has(c);
          const cls =
            c === "W"
              ? "ms-w"
              : c === "U"
                ? "ms-u"
                : c === "B"
                  ? "ms-b"
                  : c === "R"
                    ? "ms-r"
                    : "ms-g";
          return (
            <button
              key={c}
              type="button"
              title={c}
              aria-pressed={on}
              aria-label={`Color ${c}`}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-opacity hover:bg-muted/80",
                on ? "opacity-100 ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-40",
              )}
              onClick={() => toggle(c)}
            >
              <i className={cn("ms ms-cost ms-shadow text-xl", cls)} aria-hidden />
            </button>
          );
        })}
      </div>
      <div
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-background/80 p-0.5"
        role="group"
        aria-label="Color identity match"
      >
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-[10px] font-medium transition-colors",
            mode === "any"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={mode === "any"}
          onClick={() => onModeChange("any")}
        >
          Any
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-[10px] font-medium transition-colors",
            mode === "exact"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={mode === "exact"}
          onClick={() => onModeChange("exact")}
        >
          Exact
        </button>
      </div>
    </div>
  );
}
