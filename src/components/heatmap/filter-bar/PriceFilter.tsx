"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type PresetId = "0-5" | "5-20" | "20-100" | "100p";

const PRESETS: { id: PresetId; label: string; min: number | null; max: number | null }[] = [
  { id: "0-5", label: "$0–5", min: 0, max: 5 },
  { id: "5-20", label: "$5–20", min: 5, max: 20 },
  { id: "20-100", label: "$20–100", min: 20, max: 100 },
  { id: "100p", label: "$100+", min: 100, max: null },
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

type Props = {
  priceMin: number | null;
  priceMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  className?: string;
};

export function PriceFilter({ priceMin, priceMax, onChange, className }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftMin, setDraftMin] = useState("");
  const [draftMax, setDraftMax] = useState("");

  const activePreset = useMemo(() => {
    for (const p of PRESETS) {
      if (presetActive(priceMin, priceMax, p.id)) return p.id;
    }
    return null as PresetId | null;
  }, [priceMin, priceMax]);

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
    setCustomOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {PRESETS.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant={activePreset === p.id ? "secondary" : "outline"}
          size="sm"
          className="h-8 px-2 text-[11px]"
          onClick={() => clickPreset(p.id)}
        >
          {p.label}
        </Button>
      ))}
      <Popover
        open={customOpen}
        onOpenChange={(o) => {
          setCustomOpen(o);
          if (o) {
            setDraftMin(priceMin != null ? String(priceMin) : "");
            setDraftMax(priceMax != null ? String(priceMax) : "");
          }
        }}
      >
        <PopoverTrigger>
          <Button
            type="button"
            variant={!activePreset && (priceMin != null || priceMax != null) ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1 px-2 text-[11px]"
          >
            Custom
            <ChevronDown className="size-3 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Min $</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="decimal"
                  value={draftMin}
                  onChange={(e) => setDraftMin(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Max $</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="decimal"
                  value={draftMax}
                  onChange={(e) => setDraftMax(e.target.value)}
                />
              </div>
            </div>
            <Button type="button" size="sm" className="h-8 w-full text-xs" onClick={applyCustom}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
