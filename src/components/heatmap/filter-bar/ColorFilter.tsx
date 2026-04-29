"use client";

import { Fragment, useCallback } from "react";
import {
  COLOR_PIPS,
  type ColorLaneKey,
  type ColorPip,
  laneOfPip,
} from "@/lib/heatmap/color-lanes";
import { cn } from "@/lib/utils";

const PIP_CLASS: Record<ColorPip, string> = {
  W: "ms-w",
  U: "ms-u",
  B: "ms-b",
  R: "ms-r",
  G: "ms-g",
  C: "ms-c",
};

const LANE_ROWS: { key: ColorLaneKey; label: string }[] = [
  { key: "and", label: "Must have" },
  { key: "or", label: "Any of" },
  { key: "not", label: "Exclude" },
];

export type ColorLaneIntent =
  | { kind: "set"; pip: ColorPip; lane: ColorLaneKey }
  | { kind: "cycle"; pip: ColorPip; dir: "up" | "down" };

type Props = {
  colorNot: string[];
  colorOr: string[];
  colorAnd: string[];
  onIntent: (intent: ColorLaneIntent) => void;
};

export function ColorFilter({ colorNot, colorOr, colorAnd, onIntent }: Props) {
  const f = { colorNot, colorOr, colorAnd };

  const applyLane = useCallback(
    (pip: ColorPip, lane: ColorLaneKey) => {
      onIntent({ kind: "set", pip, lane });
    },
    [onIntent],
  );

  const cycleUp = useCallback(
    (pip: ColorPip) => {
      onIntent({ kind: "cycle", pip, dir: "up" });
    },
    [onIntent],
  );

  const cycleDown = useCallback(
    (pip: ColorPip) => {
      onIntent({ kind: "cycle", pip, dir: "down" });
    },
    [onIntent],
  );

  const cellKeyDown = (pip: ColorPip) => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cycleUp(pip);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      cycleDown(pip);
    }
  };

  return (
    <div className="w-fit max-w-full rounded border border-border bg-muted/30 px-1 py-0.5">
      <p className="sr-only">
        Color identity grid: Must have, Any of, Exclude rows; columns W U B R G C. Default all in Any of. Click a
        cell or use arrow keys while focused.
      </p>

      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: `minmax(3.75rem, auto) repeat(6, 1.5rem)`,
        }}
      >
        {LANE_ROWS.map(({ key: lane, label }) => (
          <Fragment key={lane}>
            <div className="flex items-center justify-end pr-0.5 text-xs font-medium leading-tight text-muted-foreground">
              {label}
            </div>
            {COLOR_PIPS.map((pip) => {
              const active = laneOfPip(pip, f) === lane;
              return (
                <button
                  key={`${lane}-${pip}`}
                  type="button"
                  className={cn(
                    "flex h-6 w-full min-w-0 items-center justify-center rounded border p-0 transition-colors",
                    active
                      ? "border-transparent bg-transparent"
                      : "border-border/40 bg-muted/30 hover:border-border hover:bg-muted/50",
                  )}
                  aria-pressed={active}
                  aria-label={`${label} · ${pip === "C" ? "Colorless" : pip}`}
                  onClick={() => applyLane(pip, lane)}
                  onKeyDown={cellKeyDown(pip)}
                >
                  {active ? (
                    <i className={cn("ms ms-cost ms-shadow text-[15px] leading-none", PIP_CLASS[pip])} aria-hidden />
                  ) : (
                    <span className="text-xs text-muted-foreground/25">·</span>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
