"use client";

import type { ColorMatchMode } from "@/lib/filter-state";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Select
        value={mode}
        onValueChange={(v) => onModeChange(v === "exact" ? "exact" : "any")}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-[5.5rem] border-0 bg-transparent px-2 text-[10px] shadow-none"
          aria-label="Color match mode"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          <SelectItem value="exact">Exact</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
