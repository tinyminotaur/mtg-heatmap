"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetIcon } from "@/components/heatmap/SetIcon";
import { HEATMAP_FILTER_TIPS } from "@/lib/heatmap-filter-tips";
import { normalizedColSort } from "@/lib/heatmap-url-params";
import { FilterFieldTip } from "./FilterFieldTip";

type CatalogSet = {
  code: string;
  name: string;
  set_type: string | null;
  icon_svg_path: string | null;
  release_date: string | null;
};

type CatalogResponse = {
  sets: CatalogSet[];
  setTypes: string[];
  groups: { id: string; label: string; description: string; setTypes: string[] }[];
};

function parseComma(sp: URLSearchParams, key: string): string[] {
  return sp.get(key)?.split(",").filter(Boolean) ?? [];
}

function toggleListValue(list: string[], value: string): string[] {
  const s = new Set(list);
  if (s.has(value)) s.delete(value);
  else s.add(value);
  return [...s].sort();
}

type Props = {
  searchParamsString: string;
  setParam: (key: string, value: string | null) => void;
};

export function HeatmapFilterColumns({ searchParamsString, setParam }: Props) {
  const sp = useMemo(() => new URLSearchParams(searchParamsString), [searchParamsString]);
  const colSortSelectValue = useMemo(() => normalizedColSort(sp), [sp]);
  const [setSearch, setSetSearch] = useState("");
  const catalogUrl = `/api/sets/catalog?${new URLSearchParams({
    ...(sp.get("digital") === "1" ? { digital: "1" } : {}),
    ...(setSearch.trim() ? { q: setSearch.trim() } : {}),
  }).toString()}`;

  const { data, isLoading } = useQuery<CatalogResponse>({
    queryKey: ["sets-catalog", catalogUrl],
    queryFn: async () => {
      const res = await fetch(catalogUrl);
      if (!res.ok) throw new Error("catalog");
      return res.json();
    },
    staleTime: 60_000,
  });

  const excludeGroups = useMemo(() => parseComma(sp, "exclGroups"), [sp]);
  const excludeTypes = useMemo(() => parseComma(sp, "exclTypes"), [sp]);
  const hiddenSets = useMemo(() => parseComma(sp, "hideSets"), [sp]);
  const allowSets = useMemo(() => parseComma(sp, "sets"), [sp]);

  const setsByType = useMemo(() => {
    const m = new Map<string, CatalogSet[]>();
    for (const s of data?.sets ?? []) {
      const t = s.set_type ?? "unknown";
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(s);
    }
    return m;
  }, [data?.sets]);

  const toggleGroup = (id: string) => {
    const next = toggleListValue(excludeGroups, id);
    setParam("exclGroups", next.length ? next.join(",") : null);
  };

  const toggleType = (t: string) => {
    const next = toggleListValue(excludeTypes, t);
    setParam("exclTypes", next.length ? next.join(",") : null);
  };

  const toggleHideSet = (code: string) => {
    const next = toggleListValue(hiddenSets, code);
    setParam("hideSets", next.length ? next.join(",") : null);
  };

  const toggleAllowSet = (code: string) => {
    const next = toggleListValue(allowSets, code);
    setParam("sets", next.length ? next.join(",") : null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Columns
        </h3>
        <FilterFieldTip tip={HEATMAP_FILTER_TIPS.columnOrder} side="right">
          <div className="cursor-help space-y-2">
            <Label>Column order</Label>
            <Select
              value={colSortSelectValue}
              onValueChange={(v) => setParam("colSort", v === "release" ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="release">Release date (oldest → newest)</SelectItem>
                <SelectItem value="release_desc">Release date (newest → oldest)</SelectItem>
                <SelectItem value="code">Set code (A–Z)</SelectItem>
                <SelectItem value="name">Set name (A–Z)</SelectItem>
                <SelectItem value="type_release">Set type, then release</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterFieldTip>
        <FilterFieldTip
          tip={
            sp.get("hlay") === "value"
              ? HEATMAP_FILTER_TIPS.heatmapColumnLayoutValue
              : HEATMAP_FILTER_TIPS.heatmapColumnLayoutSets
          }
          side="right"
        >
          <div className="mt-4 cursor-help space-y-2">
            <Label>Heatmap columns</Label>
            <Select
              value={sp.get("hlay") === "value" ? "value" : "sets"}
              onValueChange={(v) => setParam("hlay", v === "value" ? "value" : null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Layout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sets">One column per set</SelectItem>
                <SelectItem value="value">Min, median, and max (one column each)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterFieldTip>
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hide column groups
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Whole groups remove every set of those types from the heatmap columns (not row filters).
        </p>
        <div className="space-y-3">
          {(data?.groups ?? []).map((g) => (
            <label key={g.id} className="flex cursor-pointer gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
              <Checkbox
                checked={excludeGroups.includes(g.id)}
                onCheckedChange={() => toggleGroup(g.id)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{g.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{g.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hide by set type
        </h3>
        {isLoading ? <p className="text-xs text-muted-foreground">Loading set types…</p> : null}
        <div className="flex flex-wrap gap-2">
          {(data?.setTypes ?? []).map((t) => (
            <label
              key={t}
              className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background px-2 py-1"
            >
              <Checkbox checked={excludeTypes.includes(t)} onCheckedChange={() => toggleType(t)} />
              <span className="font-mono text-xs">{t}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sets (search + icons)
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">
          <strong>Hide column</strong> removes that set from columns.{" "}
          <strong>Only these</strong> is an allowlist (only checked sets show as columns).
        </p>
        <Input
          value={setSearch}
          onChange={(e) => setSetSearch(e.target.value)}
          placeholder="Filter sets by name or code…"
          className="mb-3"
        />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {(data?.sets ?? []).map((s) => (
            <div
              key={s.code}
              className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50"
            >
              <SetIcon code={s.code} iconPath={s.icon_svg_path} size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">{s.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {s.code}
                  {s.set_type ? ` · ${s.set_type}` : ""}
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <Checkbox
                  checked={hiddenSets.includes(s.code)}
                  onCheckedChange={() => toggleHideSet(s.code)}
                />
                hide
              </label>
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <Checkbox
                  checked={allowSets.includes(s.code)}
                  onCheckedChange={() => toggleAllowSet(s.code)}
                />
                only
              </label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          By set type (expand)
        </h3>
        <div className="space-y-1">
          {Array.from(setsByType.keys())
            .sort()
            .map((t) => (
            <details
              key={t}
              className="rounded-md border border-border/60 open:[&>summary>span:first-child]:rotate-90"
            >
              <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="mr-1 inline-block text-muted-foreground transition-transform">▸</span>
                <span className="font-mono">{t}</span>
                <span className="ml-1 text-muted-foreground">({setsByType.get(t)?.length ?? 0})</span>
              </summary>
              <div className="border-t border-border/40 px-2 py-2">
                <label className="mb-2 flex items-center gap-2 text-xs">
                  <Checkbox checked={excludeTypes.includes(t)} onCheckedChange={() => toggleType(t)} />
                  Hide all columns of this type
                </label>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {(setsByType.get(t) ?? []).map((s) => (
                    <div key={s.code} className="flex items-center gap-2 text-xs">
                      <SetIcon code={s.code} iconPath={s.icon_svg_path} size={16} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <Checkbox
                        checked={hiddenSets.includes(s.code)}
                        onCheckedChange={() => toggleHideSet(s.code)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
