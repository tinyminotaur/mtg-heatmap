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
    <div className="mb-3 space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
        {tiers.slice(1).map((t) => (
          <div
            key={t.tier}
            className="flex-1"
            style={{ backgroundColor: tierToColor(t.tier, dark) }}
            title={`${t.label}: ${t.range}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {tiers.slice(1).map((t) => (
          <span key={t.tier} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm border border-border/60"
              style={{ backgroundColor: tierToColor(t.tier, dark) }}
            />
            {t.label} ({t.range})
          </span>
        ))}
      </div>
    </div>
  );
}
