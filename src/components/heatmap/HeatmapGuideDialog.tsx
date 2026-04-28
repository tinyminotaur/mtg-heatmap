"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tierToColor } from "@/lib/price-scale";

const tiers = [
  { label: "Bulk", tier: 1, range: "< $1" },
  { label: "Common", tier: 2, range: "$1–5" },
  { label: "Notable", tier: 3, range: "$5–25" },
  { label: "Valuable", tier: 4, range: "$25–100" },
  { label: "Premium", tier: 5, range: "$100–500" },
  { label: "Trophy", tier: 6, range: "$500+" },
];

export type HeatmapGuideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
  statusLine: { lastLabel: string; nextLabel: string } | null;
};

export function HeatmapGuideDialog({ open, onOpenChange, dark, statusLine }: HeatmapGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,720px)] gap-0 overflow-hidden border-amber-400/25 bg-background/85 p-0 pt-6 backdrop-blur-xl shadow-[0_0_48px_-16px_rgba(234,179,8,0.35)]">
        <DialogHeader className="space-y-1 px-6 pb-4">
          <DialogTitle className="text-xl tracking-tight">How this map works</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Colors, badges, and how the grid is laid out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 overflow-y-auto px-6 pb-6">
          <section className="space-y-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-4 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-foreground">Grid</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Each row is one card (oracle).</li>
              <li>Columns are printings grouped by set, in set order — filtered by your column / search rules.</li>
              <li>POC covers sets through roughly 2005 (Alpha through Saviors-era).</li>
              <li>The header row and the card-name column stay fixed while you scroll the grid.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cell value tiers</h3>
            <p className="text-sm text-muted-foreground">
              Heat colors use non-foil USD when present, otherwise foil USD. Empty cells have no fill.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-foreground">
              {tiers.map((t) => (
                <span key={t.tier} className="inline-flex items-center gap-2">
                  <span
                    className="inline-block size-5 shrink-0 rounded-md border border-border/70 shadow-sm"
                    style={{ backgroundColor: tierToColor(t.tier, dark) }}
                    title={`${t.label}: ${t.range}`}
                  />
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted-foreground"> · {t.range}</span>
                  </span>
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lowest / Highest on cells
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-cyan-800 dark:text-cyan-200">Lowest</span> /{" "}
              <span className="font-semibold text-rose-800 dark:text-rose-200">Highest</span> badges appear only when at
              least two visible columns have a price for that card and the min and max differ (same USD rule as heat
              colors: non-foil USD, else foil USD). A single priced column gets no badge.
            </p>
          </section>

          {statusLine ? (
            <section className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 backdrop-blur-sm">
              <h3 className="text-sm font-semibold text-foreground">Price data</h3>
              <p className="text-sm text-muted-foreground">
                Updates nightly (09:00 UTC). Last updated:{" "}
                <span className="font-mono text-foreground">{statusLine.lastLabel}</span> · Next update:{" "}
                <span className="font-mono text-foreground">{statusLine.nextLabel}</span>
              </p>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
