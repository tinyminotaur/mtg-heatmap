"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, Library, Star } from "lucide-react";

export type CardSearchHit = {
  oracle_id: string;
  name: string;
  default_scryfall_id: string | null;
};

export type CardPrintingRow = {
  scryfall_id: string;
  set_code: string;
  set_name: string;
  rarity: string | null;
  released_at: string | null;
  collector_number: string | null;
  set_release: string | null;
  owned_qty: number;
  watchlisted: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFilters: () => void;
  onOpenHelp: () => void;
  onApplySearch: (q: string) => void;
  /** When set (heatmap shell), open overlays instead of routing to full pages. */
  onNavigateOwned?: () => void;
  onNavigateWatchlist?: () => void;
  /** Invalidate heatmap / portfolio after owned/watchlist mutations */
  onCollectionChanged?: () => Promise<void>;
};

function commandMatchScore(query: string, haystack: string): number {
  const ql = query.trim().toLowerCase();
  const hl = haystack.toLowerCase();
  if (!ql) return 1;
  if (hl.startsWith(ql)) return 100 + Math.min(ql.length, 20);
  if (hl.includes(ql)) return 55;
  let qi = 0;
  for (let i = 0; i < hl.length && qi < ql.length; i++) {
    if (hl[i] === ql[qi]) qi++;
  }
  return qi === ql.length ? 28 : 0;
}

function cardKey(id: string) {
  return `card:${id}`;
}

function printingKey(id: string) {
  return `printing:${id}`;
}

export function HeatmapCommandPalette({
  open,
  onOpenChange,
  onOpenFilters,
  onOpenHelp,
  onApplySearch,
  onNavigateOwned,
  onNavigateWatchlist,
  onCollectionChanged,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"search" | "printings">("search");
  const [query, setQuery] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  const [printings, setPrintings] = useState<CardPrintingRow[]>([]);
  const [selectedOracleHit, setSelectedOracleHit] = useState<CardSearchHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [activeValue, setActiveValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFirstOracleRef = useRef<string | null>(null);
  const prevFirstPrintingRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const resetPalette = useCallback(() => {
    setQuery("");
    setVersionFilter("");
    setHits([]);
    setPrintings([]);
    setSelectedOracleHit(null);
    setStep("search");
    setActiveValue("");
    setToast(null);
    prevFirstOracleRef.current = null;
    prevFirstPrintingRef.current = null;
  }, []);

  /** Escape / Backspace: leave versions step without closing palette */
  useEffect(() => {
    if (!open || step !== "printings") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setStep("search");
        setSelectedOracleHit(null);
        setPrintings([]);
        setVersionFilter("");
        prevFirstPrintingRef.current = null;
        return;
      }
      if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && versionFilter === "") {
        const t = e.target as HTMLElement;
        if (t.tagName !== "INPUT") return;
        const input = t as HTMLInputElement;
        if (input.value !== "") return;
        e.preventDefault();
        setStep("search");
        setSelectedOracleHit(null);
        setPrintings([]);
        prevFirstPrintingRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, step, versionFilter]);

  type CmdDef = {
    id: string;
    label: string;
    haystack: string;
    shortcut?: string;
    run: () => void;
  };

  const commands = useMemo<CmdDef[]>(
    () => [
      {
        id: "home",
        label: "Heatmap home",
        haystack: "heatmap home index main",
        run: () => {
          onOpenChange(false);
          router.push("/");
        },
      },
      {
        id: "owned",
        label: "Owned list",
        haystack: "owned collection library copies collection tab",
        shortcut: "G O",
        run: () => {
          onOpenChange(false);
          if (onNavigateOwned) onNavigateOwned();
          else router.push("/owned");
        },
      },
      {
        id: "watchlist",
        label: "Watchlist",
        haystack: "watchlist stars saved want",
        shortcut: "G W",
        run: () => {
          onOpenChange(false);
          if (onNavigateWatchlist) onNavigateWatchlist();
          else router.push("/watchlist");
        },
      },
      {
        id: "filters",
        label: "Open filters",
        haystack: "filters advanced panel refine facet",
        shortcut: "F",
        run: () => {
          onOpenChange(false);
          onOpenFilters();
        },
      },
      {
        id: "focus-search",
        label: "Focus heatmap search",
        haystack: "search bar filter box query url find type slash",
        shortcut: "/",
        run: () => {
          onOpenChange(false);
          document.getElementById("heatmap-search")?.focus();
        },
      },
      {
        id: "help",
        label: "Keyboard shortcuts",
        haystack: "help keyboard shortcuts keys cheat sheet question",
        shortcut: "?",
        run: () => {
          onOpenChange(false);
          onOpenHelp();
        },
      },
    ],
    [onNavigateOwned, onNavigateWatchlist, onOpenChange, onOpenFilters, onOpenHelp, router],
  );

  const scoredCommands = useMemo(() => {
    const q = query.trim();
    const rows = commands
      .map((c) => ({ ...c, score: commandMatchScore(q, `${c.label} ${c.haystack}`) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const strong = rows.filter((c) => c.score >= 92);
    const rest = rows.filter((c) => c.score < 92);
    return { strong, rest, all: rows };
  }, [commands, query]);

  const runSearch = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      searchAbortRef.current?.abort();
      setHits([]);
      setLoading(false);
      return;
    }
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(t)}`, { signal: ac.signal });
      if (!res.ok) {
        setHits([]);
        return;
      }
      const data = (await res.json()) as { results: CardSearchHit[] };
      setHits(data.results ?? []);
    } catch {
      if (!ac.signal.aborted) setHits([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== "search") return;
    const id = window.setTimeout(() => void runSearch(query), 220);
    return () => window.clearTimeout(id);
  }, [open, step, query, runSearch]);

  useEffect(() => {
    if (!query.trim()) prevFirstOracleRef.current = null;
  }, [query]);

  useEffect(() => {
    if (!open || step !== "search" || query.trim().length < 2 || hits.length === 0) return;
    const first = hits[0].oracle_id;
    if (prevFirstOracleRef.current === first) return;
    prevFirstOracleRef.current = first;
    setActiveValue(cardKey(first));
  }, [open, step, query, hits]);

  const filteredPrintings = useMemo(() => {
    const f = versionFilter.trim().toLowerCase();
    if (!f) return printings;
    return printings.filter(
      (p) =>
        p.set_name.toLowerCase().includes(f) ||
        p.set_code.toLowerCase().includes(f) ||
        (p.rarity ?? "").toLowerCase().includes(f) ||
        (p.collector_number ?? "").toLowerCase().includes(f),
    );
  }, [printings, versionFilter]);

  useEffect(() => {
    if (!versionFilter.trim()) prevFirstPrintingRef.current = null;
  }, [versionFilter]);

  useEffect(() => {
    if (!open || step !== "printings" || loadingPrintings || filteredPrintings.length === 0) return;
    const first = filteredPrintings[0].scryfall_id;
    if (prevFirstPrintingRef.current === first) return;
    prevFirstPrintingRef.current = first;
    setActiveValue(printingKey(first));
  }, [open, step, loadingPrintings, filteredPrintings]);

  const loadPrintings = useCallback(async (hit: CardSearchHit) => {
    setLoadingPrintings(true);
    setPrintings([]);
    prevFirstPrintingRef.current = null;
    try {
      const res = await fetch(`/api/cards/printings?oracle_id=${encodeURIComponent(hit.oracle_id)}`);
      if (!res.ok) {
        setPrintings([]);
        return;
      }
      const data = (await res.json()) as { printings: CardPrintingRow[] };
      setPrintings(data.printings ?? []);
    } catch {
      setPrintings([]);
    } finally {
      setLoadingPrintings(false);
    }
  }, []);

  const goToPrintings = useCallback(
    async (hit: CardSearchHit) => {
      setSelectedOracleHit(hit);
      setStep("printings");
      setVersionFilter("");
      setActiveValue("");
      await loadPrintings(hit);
    },
    [loadPrintings],
  );

  const backToSearch = useCallback(() => {
    setStep("search");
    setSelectedOracleHit(null);
    setPrintings([]);
    setVersionFilter("");
    prevFirstPrintingRef.current = null;
  }, []);

  const refreshPrintingsForSelection = useCallback(async () => {
    if (!selectedOracleHit) return;
    await loadPrintings(selectedOracleHit);
  }, [selectedOracleHit, loadPrintings]);

  const applyHeatmapSearchAndClose = useCallback(
    (name: string) => {
      onOpenChange(false);
      onApplySearch(name);
    },
    [onApplySearch, onOpenChange],
  );

  const markCardOwnedDefault = useCallback(
    async (hit: CardSearchHit, e?: React.SyntheticEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (!hit.default_scryfall_id) {
        showToast(`No printing on file for ${hit.name}`);
        return;
      }
      await fetch("/api/owned/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfall_id: hit.default_scryfall_id }),
      });
      await onCollectionChanged?.();
      showToast(`Added “${hit.name}” to owned`);
    },
    [onCollectionChanged, showToast],
  );

  const markPrintingOwned = useCallback(
    async (sid: string, label: string) => {
      await fetch("/api/owned/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfall_id: sid }),
      });
      await onCollectionChanged?.();
      await refreshPrintingsForSelection();
      showToast(`Owned · ${label}`);
    },
    [onCollectionChanged, refreshPrintingsForSelection, showToast],
  );

  const togglePrintingWatchlist = useCallback(
    async (sid: string, label: string) => {
      const res = await fetch("/api/watchlist/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfall_id: sid }),
      });
      const data = (await res.json()) as { watchlisted?: boolean };
      await onCollectionChanged?.();
      await refreshPrintingsForSelection();
      showToast(data.watchlisted ? `Watchlist · ${label}` : `Removed · ${label}`);
    },
    [onCollectionChanged, refreshPrintingsForSelection, showToast],
  );

  /** O / W shortcuts: search step O = default printing owned; printings step = highlighted row */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "o" && e.key !== "O" && e.key !== "w" && e.key !== "W") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.isContentEditable) return;

      if (step === "printings" && activeValue.startsWith("printing:")) {
        const sid = activeValue.slice("printing:".length);
        const row = printings.find((p) => p.scryfall_id === sid);
        if (!row) return;
        e.preventDefault();
        const label = `${row.set_name} (${row.set_code.toUpperCase()})`;
        if (e.key === "o" || e.key === "O") void markPrintingOwned(sid, label);
        else void togglePrintingWatchlist(sid, label);
        return;
      }

      if (step === "search" && (e.key === "o" || e.key === "O") && activeValue.startsWith("card:")) {
        const oid = activeValue.slice("card:".length);
        const hit = hits.find((h) => h.oracle_id === oid);
        if (!hit) return;
        e.preventDefault();
        void markCardOwnedDefault(hit);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, activeValue, printings, hits, markCardOwnedDefault, markPrintingOwned, togglePrintingWatchlist]);

  const displayCards = hits.slice(0, 12);
  const displayPrintings = filteredPrintings.slice(0, 80);

  const inputValue = step === "search" ? query : versionFilter;
  const setInputValue = step === "search" ? setQuery : setVersionFilter;

  const clearQueryBundle = useCallback(() => {
    setQuery("");
    setHits([]);
    setActiveValue("");
    prevFirstOracleRef.current = null;
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetPalette();
        onOpenChange(v);
      }}
      title="Command palette"
      showCloseButton
    >
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={setActiveValue}
        className="rounded-xl border border-border/60"
      >
        {step === "printings" && selectedOracleHit ? (
          <div className="flex items-center gap-1 border-b border-border px-1 py-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              onClick={() => backToSearch()}
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Button>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">{selectedOracleHit.name}</div>
          </div>
        ) : null}

        <div className="flex items-center gap-1 border-b border-border p-1 pr-2">
          <div className="min-w-0 flex-1">
            <CommandInput
              placeholder={
                step === "search"
                  ? "Find cards, filters, pages…"
                  : "Filter versions by set, code, rarity…"
              }
              value={inputValue}
              onValueChange={(v) => setInputValue(v)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
            disabled={!inputValue.trim()}
            onClick={() => {
              if (step === "search") clearQueryBundle();
              else setVersionFilter("");
            }}
          >
            Clear
          </Button>
        </div>
        {toast ? (
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-foreground">{toast}</div>
        ) : null}
        <CommandList className="max-h-[min(60vh,420px)]">
          {step === "printings" ? (
            <>
              <CommandEmpty>
                {loadingPrintings ? "Loading printings…" : displayPrintings.length === 0 ? "No matching versions." : null}
              </CommandEmpty>
              {!loadingPrintings && displayPrintings.length > 0 ? (
                <CommandGroup heading="Versions">
                  {displayPrintings.map((p) => {
                    const title = `${p.set_name} (${p.set_code.toUpperCase()})`;
                    const sub = [
                      p.rarity,
                      p.collector_number ? `#${p.collector_number}` : null,
                      p.released_at ?? p.set_release,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <CommandItem
                        key={p.scryfall_id}
                        value={printingKey(p.scryfall_id)}
                        keywords={[p.set_name, p.set_code, p.rarity ?? ""]}
                        onSelect={() => applyHeatmapSearchAndClose(selectedOracleHit!.name)}
                        className="flex flex-wrap items-start gap-2 py-2"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium leading-tight">{p.set_name}</span>
                          <span className="text-xs text-muted-foreground">
                            <span className="font-mono">{p.set_code.toUpperCase()}</span>
                            {sub ? ` · ${sub}` : null}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {p.owned_qty > 0 ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                              title="Copies in collection"
                            >
                              <Library className="size-3" aria-hidden />
                              {p.owned_qty}
                            </span>
                          ) : null}
                          {p.watchlisted ? (
                            <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="On watchlist" />
                          ) : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
            </>
          ) : (
            <>
              <CommandEmpty>
                {loading ? "Searching…" : query.trim().length < 2 ? "Type to search cards, or pick a command." : "No matches."}
              </CommandEmpty>

              {scoredCommands.strong.length > 0 ? (
                <CommandGroup heading="Quick actions">
                  {scoredCommands.strong.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`cmd:${c.id}`}
                      onSelect={() => c.run()}
                      keywords={[c.label, c.haystack]}
                    >
                      {c.label}
                      {c.shortcut ? <CommandShortcut>{c.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {scoredCommands.strong.length > 0 && (displayCards.length > 0 || scoredCommands.rest.length > 0) ? (
                <CommandSeparator />
              ) : null}

              {displayCards.length > 0 ? (
                <CommandGroup heading="Cards">
                  {displayCards.map((h) => (
                    <CommandItem
                      key={h.oracle_id}
                      value={cardKey(h.oracle_id)}
                      onSelect={() => void goToPrintings(h)}
                      keywords={[h.name]}
                      className="flex flex-wrap items-center gap-2 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={cn("h-7 shrink-0 text-xs", "pointer-events-auto")}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => void markCardOwnedDefault(h, e)}
                        title="Add earliest printing to owned without opening versions"
                      >
                        Owned +
                      </Button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {displayCards.length > 0 && scoredCommands.rest.length > 0 ? <CommandSeparator /> : null}

              {scoredCommands.rest.length > 0 ? (
                <CommandGroup heading={displayCards.length > 0 ? "More commands" : "Commands"}>
                  {scoredCommands.rest.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`cmd:${c.id}`}
                      onSelect={() => c.run()}
                      keywords={[c.label, c.haystack]}
                    >
                      {c.label}
                      {c.shortcut ? <CommandShortcut>{c.shortcut}</CommandShortcut> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          )}
        </CommandList>
        <div className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
          {step === "search" ? (
            <>
              <span className="font-medium text-foreground">Enter</span> choose card ·{" "}
              <span className="font-mono">O</span> owned (default printing) · rows run on highlight
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">↑↓</span> move ·{" "}
              <span className="font-mono">O</span>{" "}
              <Library className="inline size-3 align-text-bottom opacity-80" aria-hidden /> owned ·{" "}
              <span className="font-mono">W</span>{" "}
              <Star className="inline size-3 align-text-bottom opacity-80" aria-hidden /> watchlist ·{" "}
              <span className="font-medium text-foreground">Enter</span> heatmap search ·{" "}
              <span className="font-medium text-foreground">Esc</span> back
            </>
          )}
        </div>
      </Command>
    </CommandDialog>
  );
}
