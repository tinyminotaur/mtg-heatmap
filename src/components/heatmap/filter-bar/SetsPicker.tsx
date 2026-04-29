"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EIGHTH_ED_CUTOFF = "2003-07-28";

type CatalogSet = {
  code: string;
  name: string;
  set_type: string | null;
  release_date: string | null;
};

type CatalogResponse = { sets: CatalogSet[] };

type Props = {
  selectedSets: string[];
  onSelectedSetsChange: (codes: string[]) => void;
  includeDigital: boolean;
  onPresetReservedRows?: () => void;
  className?: string;
};

export function SetsPicker({
  selectedSets,
  onSelectedSetsChange,
  includeDigital,
  onPresetReservedRows,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const catalogUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (includeDigital) p.set("digital", "1");
    if (q.trim()) p.set("q", q.trim());
    return `/api/sets/catalog?${p.toString()}`;
  }, [includeDigital, q]);

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: ["sets-picker-catalog", catalogUrl],
    queryFn: async () => {
      const res = await fetch(catalogUrl);
      if (!res.ok) throw new Error("catalog");
      return res.json();
    },
    staleTime: 60_000,
    enabled: open,
  });

  const selected = useMemo(() => new Set(selectedSets.map((c) => c.toLowerCase())), [selectedSets]);

  const toggle = useCallback(
    (code: string) => {
      const c = code.trim().toLowerCase();
      const next = new Set(selected);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      onSelectedSetsChange([...next].sort());
    },
    [onSelectedSetsChange, selected],
  );

  const sets = data?.sets ?? [];

  const applyPremodern = () => {
    const codes = sets
      .filter((s) => s.release_date && s.release_date < EIGHTH_ED_CUTOFF)
      .map((s) => s.code.toLowerCase());
    onSelectedSetsChange([...new Set(codes)].sort());
  };

  const applyCore = () => {
    const codes = sets.filter((s) => s.set_type === "core").map((s) => s.code.toLowerCase());
    onSelectedSetsChange([...new Set(codes)].sort());
  };

  const clearAll = () => onSelectedSetsChange([]);

  const label =
    selectedSets.length === 0 ? "Sets" : `Sets (${selectedSets.length})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-9 min-w-[5.5rem] justify-between gap-1 px-2 text-xs", className)}
          aria-expanded={open}
        >
          {label}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        <div className="border-b border-border p-2">
          <Label className="sr-only">Search sets</Label>
          <Input
            className="h-8 text-sm"
            placeholder="Search sets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto overscroll-contain p-2">
          {isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : sets.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No sets</p>
          ) : (
            sets.map((s) => {
              const on = selected.has(s.code.toLowerCase());
              const y = s.release_date?.slice(0, 4) ?? "—";
              return (
                <div
                  key={s.code}
                  className="flex items-center gap-2 border-b border-border/40 py-1"
                >
                  <Checkbox
                    checked={on}
                    onCheckedChange={() => toggle(s.code)}
                    aria-label={`${s.name} ${s.code}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {s.name}{" "}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ({s.code.toUpperCase()})
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{y}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap gap-1 border-t border-border p-2">
          <Button type="button" variant="secondary" size="sm" className="h-7 text-[10px]" onClick={applyPremodern}>
            Pre-Modern
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-7 text-[10px]" onClick={applyCore}>
            Core sets
          </Button>
          {onPresetReservedRows ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => {
                onPresetReservedRows();
                setOpen(false);
              }}
            >
              Reserved cards
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
