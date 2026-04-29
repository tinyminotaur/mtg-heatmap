"use client";

import { ChevronDown } from "lucide-react";
import { useTheme } from "@/components/app-theme-provider";
import { useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { tierToColor } from "@/lib/price-scale";

type PresetId = "0-5" | "5-20" | "20-100" | "100p";

const PRESETS: { id: PresetId; label: string; min: number | null; max: number | null; tier: number }[] = [
  { id: "0-5", label: "$0–5", min: 0, max: 5, tier: 2 },
  { id: "5-20", label: "$5–20", min: 5, max: 20, tier: 3 },
  { id: "20-100", label: "$20–100", min: 20, max: 100, tier: 4 },
  { id: "100p", label: "$100+", min: 100, max: null, tier: 6 },
];

function presetActive(
  min: number | null,
  max: number | null,
  id: PresetId,
): boolean {
  const p = PRESETS.find((x) => x.id === id)!;
  if (p.max == null) return min === p.min && max == null;
  return min === p.min && max === p.max;
}

export type CellPriceFieldOption = "usd" | "usd_foil" | "eur" | "tix";

type Props = {
  priceMin: number | null;
  priceMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  cellPriceField: CellPriceFieldOption;
  onPriceFieldChange: (field: CellPriceFieldOption) => void;
  className?: string;
};

export function PriceFilter({
  priceMin,
  priceMax,
  onChange,
  cellPriceField,
  onPriceFieldChange,
  className,
}: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState("");
  const [draftMax, setDraftMax] = useState("");

  const activePreset = useMemo(() => {
    for (const p of PRESETS) {
      if (presetActive(priceMin, priceMax, p.id)) return p.id;
    }
    return null as PresetId | null;
  }, [priceMin, priceMax]);

  const triggerSummary = useMemo(() => {
    const fieldLabel =
      cellPriceField === "usd"
        ? "USD"
        : cellPriceField === "usd_foil"
          ? "USD foil"
          : cellPriceField === "eur"
            ? "EUR"
            : "TIX";
    if (activePreset) {
      const p = PRESETS.find((x) => x.id === activePreset)!;
      return `${fieldLabel} · ${p.label}`;
    }
    if (priceMin != null || priceMax != null) {
      const a = priceMin != null ? `$${priceMin}` : "…";
      const b = priceMax != null ? `$${priceMax}` : "…";
      return `${fieldLabel} · ${a}–${b}`;
    }
    return `${fieldLabel} · Any`;
  }, [activePreset, cellPriceField, priceMin, priceMax]);

  const clickPreset = (id: PresetId) => {
    const p = PRESETS.find((x) => x.id === id)!;
    if (activePreset === id) {
      onChange(null, null);
    } else {
      onChange(p.min, p.max);
    }
  };

  const applyCustom = () => {
    const a = draftMin.trim() === "" ? null : Number(draftMin);
    const b = draftMax.trim() === "" ? null : Number(draftMax);
    if (a != null && !Number.isFinite(a)) return;
    if (b != null && !Number.isFinite(b)) return;
    onChange(a, b);
  };

  const onPopoverOpen = (o: boolean) => {
    setOpen(o);
    if (o) {
      setDraftMin(priceMin != null ? String(priceMin) : "");
      setDraftMax(priceMax != null ? String(priceMax) : "");
    }
  };

  return (
    <Popover open={open} onOpenChange={onPopoverOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-9 gap-1.5 px-2.5 text-xs font-normal",
          className,
        )}
        aria-label="Price filters"
      >
        <span className="font-medium">Price</span>
        <span className="max-w-[11rem] truncate text-muted-foreground">{triggerSummary}</span>
        <ChevronDown className="size-3 shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cell price field</Label>
            <Select
              value={cellPriceField}
              onValueChange={(v) =>
                onPriceFieldChange(
                  v === "usd_foil" || v === "eur" || v === "tix" ? v : "usd",
                )
              }
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">USD (non-foil)</SelectItem>
                <SelectItem value="usd_foil">USD foil</SelectItem>
                <SelectItem value="eur">EUR</SelectItem>
                <SelectItem value="tix">TIX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">USD band (heatmap)</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => {
                const active = activePreset === p.id;
                const fill = tierToColor(p.tier, dark);
                return (
                  <Button
                    key={p.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 border-2 px-2.5 text-xs font-semibold shadow-sm transition-colors",
                      active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                    style={{
                      backgroundColor: active ? `${fill}55` : `${fill}28`,
                      borderColor: fill,
                      color: dark ? "#f9fafb" : "#111827",
                    }}
                    onClick={() => clickPreset(p.id)}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">Custom range ({cellPriceField.toUpperCase()})</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Min $</Label>
                <Input
                  className="h-9 text-xs"
                  inputMode="decimal"
                  value={draftMin}
                  onChange={(e) => setDraftMin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max $</Label>
                <Input
                  className="h-9 text-xs"
                  inputMode="decimal"
                  value={draftMax}
                  onChange={(e) => setDraftMax(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full text-xs"
              onClick={() => {
                applyCustom();
                setOpen(false);
              }}
            >
              Apply range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
