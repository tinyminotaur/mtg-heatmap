"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import type { VisibilityState } from "@tanstack/react-table";

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

export type HeatmapFilterColumnsProps = {
  queryString: string;
  onReplaceQuery: (params: URLSearchParams) => void;
  showEmptyColumns: { checked: boolean; onChange: (v: boolean) => void };
  /** columnFilters = groups/types/sets only; columnSort = order + layout + empty cols */
  variant?: "full" | "columnFilters" | "columnSort";
  /** Current resolved heatmap columns (from `/api/heatmap`), for a quick “visibility” toggle list. */
  currentColumns?: CatalogSet[];
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  topSets?: { code: string; name: string; n: number }[];
};

export function HeatmapFilterColumns({
  queryString,
  onReplaceQuery,
  showEmptyColumns,
  variant = "full",
  currentColumns,
  columnVisibility,
  onColumnVisibilityChange,
  topSets,
}: HeatmapFilterColumnsProps) {
  const sp = useMemo(() => new URLSearchParams(queryString), [queryString]);
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
  const quickPinCols = useMemo(() => parseComma(sp, "qc").map((x) => x.trim().toLowerCase()).filter(Boolean), [sp]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(queryString);
      if (value === null || value === "") p.delete(key);
      else p.set(key, value);
      onReplaceQuery(p);
    },
    [queryString, onReplaceQuery],
  );

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

  const toggleQuickPinCol = (code: string) => {
    const c = code.trim().toLowerCase();
    if (!c) return;
    const next = toggleListValue(quickPinCols, c);
    setParam("qc", next.length ? next.join(",") : null);
  };

  const groupBadges =
    excludeGroups.length === 0 ? "Show all groups" : `${excludeGroups.length} hidden`;
  const typeBadges =
    excludeTypes.length === 0 ? "Show all types" : `${excludeTypes.length} hidden`;

  const showSort = variant === "full" || variant === "columnSort";
  const showFilters = variant === "full" || variant === "columnFilters";
  const canToggleVisibility = Boolean(currentColumns && columnVisibility && onColumnVisibilityChange);
  const showTopSets = showFilters && (topSets?.length ?? 0) > 0;

  const toggleVisibleColumn = (code: string) => {
    if (!canToggleVisibility) return;
    const id = `set:${code}`;
    const cur = columnVisibility![id];
    const next: VisibilityState = { ...columnVisibility, [id]: !(cur !== false) };
    onColumnVisibilityChange!(next);
  };

  return (
    <div className="space-y-4">
      {showSort ? (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FilterFieldTip tip={HEATMAP_FILTER_TIPS.columnOrder} side="right">
          <div className="cursor-help space-y-1.5">
            <Label className="text-xs text-muted-foreground">Column order</Label>
            <Select
              value={colSortSelectValue}
              onValueChange={(v) => setParam("colSort", v === "release" ? null : v)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
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
          <div className="cursor-help space-y-1.5">
            <Label className="text-xs text-muted-foreground">Heatmap columns</Label>
            <Select
              value={sp.get("hlay") === "value" ? "value" : "sets"}
              onValueChange={(v) => setParam("hlay", v === "value" ? "value" : null)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Layout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sets">One column per set</SelectItem>
                <SelectItem value="value">Min / median / max columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterFieldTip>
      </div>

      <FilterFieldTip tip={HEATMAP_FILTER_TIPS.showEmptyColumns}>
        <label className="flex cursor-help items-center gap-2 text-xs">
          <Checkbox checked={showEmptyColumns.checked} onCheckedChange={(v) => showEmptyColumns.onChange(Boolean(v))} />
          Show empty columns (sets in scope with no matching printing)
        </label>
      </FilterFieldTip>
        </>
      ) : null}

      {showFilters ? (
        <>
      {canToggleVisibility ? (
        <div className={cn("space-y-2", showSort ? "border-t border-border pt-4" : "")}>
          <p className="text-xs font-medium text-muted-foreground">Current columns · show/hide</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {(currentColumns ?? [])
              .filter((c) => c.set_type !== "aggregate" && !c.code.startsWith("__"))
              .map((c) => {
                const id = `set:${c.code}`;
                const visible = (columnVisibility?.[id] ?? true) !== false;
                return (
                  <label
                    key={c.code}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-mono">{c.code.toUpperCase()}</span> · {c.name}
                    </span>
                    <Checkbox checked={visible} onCheckedChange={() => toggleVisibleColumn(c.code)} />
                  </label>
                );
              })}
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            This toggles visibility via URL params (server-side columns). If you’re in “only these sets” mode, toggles update that allowlist.
          </p>
        </div>
      ) : null}

      {showTopSets ? (
        <div className={cn("space-y-2", showSort ? "border-t border-border pt-4" : "")}>
          <p className="text-xs font-medium text-muted-foreground">Top sets in results</p>
          <div className="space-y-1 rounded-md border border-border p-2">
            {(topSets ?? []).slice(0, 10).map((s) => (
              <div key={s.code} className="flex items-center gap-2 rounded-sm px-1 py-1 hover:bg-muted/40">
                <SetIcon code={s.code} iconPath={null} size={18} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium leading-tight">{s.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {s.code} · {s.n.toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}
                  onClick={() => toggleHideSet(s.code)}
                >
                  hide
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}
                  onClick={() => toggleAllowSet(s.code)}
                >
                  only
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}
                  onClick={() => toggleQuickPinCol(s.code)}
                  aria-pressed={quickPinCols.includes(s.code.toLowerCase())}
                >
                  qc
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs leading-snug text-muted-foreground">
            Actions update URL params: <span className="font-mono">hideSets</span>, <span className="font-mono">sets</span>,{" "}
            <span className="font-mono">qc</span>.
          </p>
        </div>
      ) : null}

      <div className={cn("flex flex-wrap gap-2 pt-4", showSort ? "border-t border-border" : "")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 max-w-full shrink text-xs",
            )}
          >
            Column groups · {groupBadges}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[min(70vh,28rem)] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto p-1" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs leading-snug font-normal text-muted-foreground">
                Exclude whole release groups from column list (not row filters).
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(data?.groups ?? []).map((g) => (
                <DropdownMenuCheckboxItem
                  key={g.id}
                  checked={excludeGroups.includes(g.id)}
                  onCheckedChange={() => toggleGroup(g.id)}
                >
                  <span className="flex flex-col gap-0.5">
                    <span>{g.label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{g.description}</span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 max-w-full shrink text-xs",
            )}
          >
            Set types · {typeBadges}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[min(70vh,28rem)] w-56 overflow-y-auto" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Exclude columns by Scryfall set_type
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isLoading ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Loading…</p>
              ) : (
                (data?.setTypes ?? []).map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={excludeTypes.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                    className="font-mono text-xs"
                  >
                    {t}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Sets · search &amp; per-column</p>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          <strong>Hide</strong> removes that edition from columns. <strong>Only</strong> is an allowlist (checked sets only).
        </p>
        <Input
          value={setSearch}
          onChange={(e) => setSetSearch(e.target.value)}
          placeholder="Filter sets by name or code…"
          className="mb-3 h-8 text-sm"
        />
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 md:max-h-64">
          {(data?.sets ?? []).map((s) => (
            <div
              key={s.code}
              className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/50"
            >
              <SetIcon code={s.code} iconPath={s.icon_svg_path} size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">{s.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {s.code}
                  {s.set_type ? ` · ${s.set_type}` : ""}
                </div>
              </div>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={hiddenSets.includes(s.code)}
                  onCheckedChange={() => toggleHideSet(s.code)}
                />
                hide
              </label>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
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
        </>
      ) : null}
    </div>
  );
}
