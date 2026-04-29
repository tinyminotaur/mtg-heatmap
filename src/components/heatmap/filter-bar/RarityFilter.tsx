"use client";

import { cn } from "@/lib/utils";

const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;

type Props = {
  selected: string[];
  onChange: (rarities: string[]) => void;
};

const styles: Record<(typeof RARITIES)[number], string> = {
  common:
    "data-[on=true]:border-muted-foreground/60 data-[on=true]:bg-muted data-[on=true]:text-foreground",
  uncommon:
    "data-[on=true]:border-sky-400/70 data-[on=true]:bg-sky-500/15 data-[on=true]:text-sky-950 dark:data-[on=true]:text-sky-50",
  rare: "data-[on=true]:border-amber-500/80 data-[on=true]:bg-amber-500/15 data-[on=true]:text-amber-950 dark:data-[on=true]:text-amber-50",
  mythic:
    "data-[on=true]:border-orange-600/90 data-[on=true]:bg-gradient-to-br data-[on=true]:from-orange-500/25 data-[on=true]:to-rose-600/25 data-[on=true]:text-foreground",
};

export function RarityFilter({ selected, onChange }: Props) {
  const set = new Set(selected);

  const toggle = (r: string) => {
    const next = new Set(selected);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    onChange([...next].sort());
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {RARITIES.map((r) => {
        const on = set.has(r);
        return (
          <button
            key={r}
            type="button"
            data-on={on}
            aria-pressed={on}
            className={cn(
              "rounded-full border border-border px-2 py-1 text-xs font-semibold capitalize tracking-wide transition-colors",
              !on && "bg-muted/30 text-muted-foreground hover:bg-muted/60",
              styles[r],
            )}
            onClick={() => toggle(r)}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
