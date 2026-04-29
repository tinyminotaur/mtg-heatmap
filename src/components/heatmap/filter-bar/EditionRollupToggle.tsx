"use client";

import { cn } from "@/lib/utils";

type Props = {
  /** `true` when Min / Median / Max rollup columns are shown. */
  isRollup: boolean;
  onToggle: () => void;
  /**
   * `bar` — full labels (filter rail).
   * `strip` — tight copy next to the grid header seam.
   */
  variant?: "bar" | "strip";
  className?: string;
  style?: React.CSSProperties;
};

export function EditionRollupToggle({
  isRollup,
  onToggle,
  variant = "bar",
  className,
  style,
}: Props) {
  const strip = variant === "strip";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border bg-muted/25 px-2 py-1",
        strip && "gap-1 border-border/80 bg-background/95 py-0.5 pl-1 pr-1.5 shadow-sm backdrop-blur-sm",
        className,
      )}
      style={style}
    >
      <span
        className={cn(
          "shrink-0 font-medium text-muted-foreground",
          strip ? "text-[10px] leading-none sm:text-xs" : "text-xs",
        )}
      >
        {strip ? "Ed." : "Edition"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isRollup}
        title={
          isRollup
            ? "Showing Min / Median / Max rollup — click for one column per edition"
            : "One column per edition — click for Min / Median / Max rollup"
        }
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isRollup ? "bg-primary" : "bg-muted",
        )}
        onClick={onToggle}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-4 translate-x-0.5 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform",
            isRollup && "translate-x-[1.125rem]",
          )}
          aria-hidden
        />
      </button>
      <span
        className={cn(
          "shrink-0 font-medium text-muted-foreground",
          strip ? "text-[10px] leading-none sm:text-xs" : "text-xs",
        )}
      >
        Rollup
      </span>
    </div>
  );
}
