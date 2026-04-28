"use client";

import { tierToColor } from "@/lib/price-scale";

const tiers = [
  { label: "Empty", tier: 0, range: "—" },
  { label: "Bulk", tier: 1, range: "< $1" },
  { label: "Common", tier: 2, range: "$1–5" },
  { label: "Notable", tier: 3, range: "$5–25" },
  { label: "Valuable", tier: 4, range: "$25–100" },
  { label: "Premium", tier: 5, range: "$100–500" },
  { label: "Trophy", tier: 6, range: "$500+" },
];

export function Legend({ dark }: { dark: boolean }) {
  return (
    <div className="mb-3 space-y-3 rounded-lg border border-border bg-muted/15 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cell value tiers</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-foreground">
        {tiers.slice(1).map((t) => (
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
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-cyan-800 dark:text-cyan-200">Lowest</span> /{" "}
        <span className="font-semibold text-rose-800 dark:text-rose-200">Highest</span> on cells appear only when
        at least two visible columns have a price for that card and the min and max differ (same USD rule as heat
        colors: non-foil USD, else foil USD). A single priced column gets no badge.
      </p>
    </div>
  );
}
