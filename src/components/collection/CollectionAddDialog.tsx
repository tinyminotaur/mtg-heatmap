"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Library, Plus, Star } from "lucide-react";
import type { CardPrintingRow, CardSearchHit } from "@/components/heatmap/HeatmapCommandPalette";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type CollectionAddMode = "owned" | "watchlist";

function cardKey(id: string) {
  return `card:${id}`;
}

function printingKey(id: string) {
  return `printing:${id}`;
}

async function invalidateCollectionQueries(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["owned-list"] }),
    qc.invalidateQueries({ queryKey: ["watchlist"] }),
    qc.invalidateQueries({ queryKey: ["portfolio"] }),
    qc.invalidateQueries({ queryKey: ["heatmap"] }),
    qc.invalidateQueries({ queryKey: ["heatmap-facets"] }),
  ]);
}

type Props = {
  mode: CollectionAddMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CollectionAddDialog({ mode, open, onOpenChange }: Props) {
  const qc = useQueryClient();
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
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const reset = useCallback(() => {
    setStep("search");
    setQuery("");
    setVersionFilter("");
    setHits([]);
    setPrintings([]);
    setSelectedOracleHit(null);
    setActiveValue("");
    setToast(null);
    prevFirstOracleRef.current = null;
    prevFirstPrintingRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

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

  const loadPrintings = useCallback(async (hit: CardSearchHit) => {
    setLoadingPrintings(true);
    setPrintings([]);
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
      prevFirstPrintingRef.current = null;
      await loadPrintings(hit);
    },
    [loadPrintings],
  );

  const refreshPrintings = useCallback(async () => {
    if (!selectedOracleHit) return;
    await loadPrintings(selectedOracleHit);
  }, [selectedOracleHit, loadPrintings]);

  const addOwned = useCallback(
    async (sid: string, label: string) => {
      await fetch("/api/owned/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfall_id: sid }),
      });
      await invalidateCollectionQueries(qc);
      await refreshPrintings();
      showToast(`Added · ${label}`);
    },
    [qc, refreshPrintings, showToast],
  );

  const addWatchlist = useCallback(
    async (p: CardPrintingRow, label: string) => {
      if (p.watchlisted) {
        showToast("Already on watchlist");
        return;
      }
      const res = await fetch("/api/watchlist/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scryfall_id: p.scryfall_id }),
      });
      if (!res.ok) {
        showToast("Could not add");
        return;
      }
      await invalidateCollectionQueries(qc);
      await refreshPrintings();
      showToast(`Watchlist · ${label}`);
    },
    [qc, refreshPrintings, showToast],
  );

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

  const displayCards = hits.slice(0, 25);
  const displayPrintings = filteredPrintings.slice(0, 100);

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

  useEffect(() => {
    if (!versionFilter.trim()) prevFirstPrintingRef.current = null;
  }, [versionFilter]);

  useEffect(() => {
    if (!open || step !== "printings" || loadingPrintings || displayPrintings.length === 0) return;
    const first = displayPrintings[0].scryfall_id;
    if (prevFirstPrintingRef.current === first) return;
    prevFirstPrintingRef.current = first;
    setActiveValue(printingKey(first));
  }, [open, step, loadingPrintings, displayPrintings]);

  const inputValue = step === "search" ? query : versionFilter;
  const setInputValue = step === "search" ? setQuery : setVersionFilter;

  useEffect(() => {
    if (!open || step !== "printings") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setStep("search");
        setSelectedOracleHit(null);
        setPrintings([]);
        setVersionFilter("");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, step]);

  const title = mode === "owned" ? "Add owned copy" : "Add to watchlist";
  const addVerb = mode === "owned" ? "Add copy" : "Add";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "flex max-h-[min(90dvh,720px)] w-[min(96vw,42rem)] max-w-[min(96vw,42rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,42rem)]",
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Search for a card by name, then choose a printing to add.
          </DialogDescription>
        </DialogHeader>

        {step === "printings" && selectedOracleHit ? (
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2 text-xs"
              onClick={() => {
                setStep("search");
                setSelectedOracleHit(null);
                setPrintings([]);
                setVersionFilter("");
              }}
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Button>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{selectedOracleHit.name}</div>
          </div>
        ) : null}

        <Command shouldFilter={false} value={activeValue} onValueChange={setActiveValue} className="rounded-none border-0 bg-transparent">
          <div className="flex items-center gap-1 border-b border-border p-2">
            <CommandInput
              placeholder={
                step === "search" ? "Fuzzy search card name…" : "Filter versions by set, code, rarity…"
              }
              value={inputValue}
              onValueChange={(v) => setInputValue(v)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-xs"
              disabled={!inputValue.trim()}
              onClick={() => {
                if (step === "search") {
                  setQuery("");
                  setHits([]);
                } else setVersionFilter("");
              }}
            >
              Clear
            </Button>
          </div>

          {toast ? (
            <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs text-foreground">{toast}</div>
          ) : null}

          <CommandList className="max-h-[min(55vh,380px)] overflow-y-auto">
            {step === "printings" ? (
              <>
                <CommandEmpty>
                  {loadingPrintings
                    ? "Loading printings…"
                    : displayPrintings.length === 0
                      ? "No matching versions."
                      : null}
                </CommandEmpty>
                {!loadingPrintings && displayPrintings.length > 0 ? (
                  <CommandGroup heading="Versions">
                    {displayPrintings.map((p) => {
                      const label = `${p.set_name} (${p.set_code.toUpperCase()})`;
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
                          className="flex flex-wrap items-start gap-2 py-2 aria-selected:bg-accent/40"
                          onSelect={() => {
                            if (mode === "owned") void addOwned(p.scryfall_id, label);
                            else void addWatchlist(p, label);
                          }}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate font-medium leading-tight">{p.set_name}</span>
                            <span className="text-xs text-muted-foreground">
                              <span className="font-mono">{p.set_code.toUpperCase()}</span>
                              {sub ? ` · ${sub}` : null}
                            </span>
                          </div>
                          <div className="pointer-events-none flex shrink-0 items-center gap-2">
                            {mode === "owned" && p.owned_qty > 0 ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                                title="Copies in collection"
                              >
                                <Library className="size-3" aria-hidden />
                                {p.owned_qty}
                              </span>
                            ) : null}
                            {mode === "watchlist" && p.watchlisted ? (
                              <Star className="size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="On watchlist" />
                            ) : null}
                            <span
                              className={cn(
                                buttonVariants({
                                  variant: mode === "watchlist" && p.watchlisted ? "outline" : "secondary",
                                  size: "sm",
                                }),
                                "inline-flex h-8 items-center gap-1 text-xs",
                                mode === "watchlist" && p.watchlisted && "opacity-70",
                              )}
                            >
                              <Plus className="size-3.5" aria-hidden />
                              {mode === "watchlist" && p.watchlisted ? "On list" : addVerb}
                            </span>
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
                  {loading
                    ? "Searching…"
                    : query.trim().length < 2
                      ? "Type at least 2 letters to search."
                      : "No matches."}
                </CommandEmpty>
                {displayCards.length > 0 ? (
                  <CommandGroup heading="Cards">
                    {displayCards.map((h) => (
                      <CommandItem
                        key={h.oracle_id}
                        value={cardKey(h.oracle_id)}
                        keywords={[h.name]}
                        onSelect={() => void goToPrintings(h)}
                        className="py-2"
                      >
                        <span className="truncate font-medium">{h.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>

        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {step === "search" ? (
            <>
              <span className="font-medium text-foreground">Enter</span> on a card to choose versions · fuzzy match
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">Enter</span> adds the highlighted version ·{" "}
              <span className="font-medium text-foreground">↑↓</span> move ·{" "}
              <span className="font-medium text-foreground">Esc</span> back
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
