"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveSetIconSvgUrl } from "@/lib/set-icon-url";
import { cn } from "@/lib/utils";

const EIGHTH_ED_CUTOFF = "2003-07-28";

type CatalogSet = {
  code: string;
  name: string;
  set_type: string | null;
  icon_svg_path: string | null;
  release_date: string | null;
};

type CatalogResponse = { sets: CatalogSet[]; setTypes?: string[] };

function shortSetTypeLabel(t: string | null): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    core: "Core",
    expansion: "Exp",
    masters: "Masters",
    commander: "Cmd",
    draft_innovation: "Draft",
    promo: "Promo",
    starter: "Starter",
    starter_kit: "Starter",
    box: "Box",
    funpack: "Fun",
    token: "Token",
    memorabilia: "Mem",
    alchemy: "Alchemy",
    dungeon: "Dungeon",
    planechase: "Plane",
    vanguard: "Van",
    duel_deck: "Duel",
    masterpiece: "Master",
    from_the_vault: "FtV",
    premium_deck: "Prem",
    arsenal: "Ars",
    minigame: "Mini",
  };
  if (map[t]) return map[t];
  const words = t.replace(/_/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return t;
  if (words.length === 1) return words[0]!.slice(0, 6);
  return `${words[0]!.slice(0, 3)}…`;
}

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
  /** Empty set = show all types; otherwise only these `set_type` values appear in the list. */
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set());

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

  const setsRaw = useMemo(() => data?.sets ?? [], [data?.sets]);
  const catalogTypes = useMemo(() => {
    const fromApi = data?.setTypes?.filter(Boolean) as string[] | undefined;
    if (fromApi?.length) return [...fromApi].sort();
    const s = new Set<string>();
    for (const x of setsRaw) {
      if (x.set_type) s.add(x.set_type);
    }
    return [...s].sort();
  }, [data?.setTypes, setsRaw]);

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

  const visibleSets = useMemo(() => {
    let list = setsRaw;
    if (typeFilter.size > 0) {
      list = list.filter((s) => s.set_type != null && typeFilter.has(s.set_type));
    }
    return list;
  }, [setsRaw, typeFilter]);

  const toggleTypeInFilter = useCallback((t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const clearTypeFilter = useCallback(() => setTypeFilter(new Set()), []);

  const selectAllVisible = useCallback(() => {
    const next = new Set(selected);
    for (const s of visibleSets) {
      next.add(s.code.toLowerCase());
    }
    onSelectedSetsChange([...next].sort());
  }, [visibleSets, onSelectedSetsChange, selected]);

  const applyPremodern = () => {
    const codes = visibleSets
      .filter((s) => s.release_date && s.release_date < EIGHTH_ED_CUTOFF)
      .map((s) => s.code.toLowerCase());
    onSelectedSetsChange([...new Set(codes)].sort());
  };

  const applyCore = () => {
    const codes = visibleSets.filter((s) => s.set_type === "core").map((s) => s.code.toLowerCase());
    onSelectedSetsChange([...new Set(codes)].sort());
  };

  const clearAll = () => onSelectedSetsChange([]);

  const label = selectedSets.length === 0 ? "Sets" : `Sets (${selectedSets.length})`;

  const onPopoverOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQ("");
  }, []);

  return (
    <Popover open={open} onOpenChange={onPopoverOpenChange}>
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
      <PopoverContent className="w-[min(100vw-2rem,26rem)] p-0" align="start">
        <div className="border-b border-border p-2">
          <Label className="sr-only">Search sets</Label>
          <Input
            className="h-8 text-sm"
            placeholder="Search sets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {catalogTypes.length ? (
          <div className="border-b border-border px-2 py-2">
            <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Show set types (multi)</p>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant={typeFilter.size === 0 ? "secondary" : "outline"}
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={clearTypeFilter}
              >
                All types
              </Button>
              {catalogTypes.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={typeFilter.has(t) ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => toggleTypeInFilter(t)}
                >
                  {shortSetTypeLabel(t)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="max-h-64 overflow-y-auto overscroll-contain p-2">
          {isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : visibleSets.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No sets match</p>
          ) : (
            visibleSets.map((s) => {
              const on = selected.has(s.code.toLowerCase());
              const y = s.release_date?.slice(0, 4) ?? "—";
              const iconUrl = resolveSetIconSvgUrl(s.code, s.icon_svg_path);
              const tag = shortSetTypeLabel(s.set_type);
              return (
                <div
                  key={s.code}
                  className="flex items-center gap-2 border-b border-border/40 py-1.5"
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="max-w-[4.5rem] truncate text-right text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                      title={s.set_type ?? ""}
                    >
                      {tag}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconUrl}
                      alt=""
                      width={16}
                      height={16}
                      className="size-4 shrink-0 object-contain"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                    <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                      {y}
                    </span>
                  </div>
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
          <Button type="button" variant="secondary" size="sm" className="h-7 text-[10px]" onClick={selectAllVisible}>
            Select all
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
