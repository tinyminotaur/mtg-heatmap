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

export type CardSearchHit = {
  oracle_id: string;
  name: string;
  default_scryfall_id: string | null;
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
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeValue, setActiveValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFirstOracleRef = useRef<string | null>(null);

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
    if (!open) return;
    const id = window.setTimeout(() => void runSearch(query), 220);
    return () => window.clearTimeout(id);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!query.trim()) prevFirstOracleRef.current = null;
  }, [query]);

  /** When fuzzy results refresh, select the best card match without fighting arrow-key navigation of the same list. */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2 || hits.length === 0) return;
    const first = hits[0].oracle_id;
    if (prevFirstOracleRef.current === first) return;
    prevFirstOracleRef.current = first;
    setActiveValue(cardKey(first));
  }, [open, query, hits]);

  const clearQuery = useCallback(() => {
    setQuery("");
    setHits([]);
    setActiveValue("");
    prevFirstOracleRef.current = null;
  }, []);

  const applyCardSearch = useCallback(
    (name: string) => {
      onOpenChange(false);
      onApplySearch(name);
    },
    [onApplySearch, onOpenChange],
  );

  const markCardOwned = useCallback(
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

  /** Palette-local shortcut: mark highlighted card owned */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "o" && e.key !== "O") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (!activeValue.startsWith("card:")) return;
      const oid = activeValue.slice("card:".length);
      const hit = hits.find((h) => h.oracle_id === oid);
      if (!hit) return;
      e.preventDefault();
      void markCardOwned(hit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeValue, hits, markCardOwned]);

  const displayCards = hits.slice(0, 12);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setQuery("");
          setHits([]);
          setToast(null);
          prevFirstOracleRef.current = null;
        }
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
        <div className="flex items-center gap-1 border-b border-border p-1 pr-2">
          <div className="min-w-0 flex-1">
            <CommandInput
              placeholder="Find cards, filters, pages…"
              value={query}
              onValueChange={(v) => setQuery(v)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
            disabled={!query.trim()}
            onClick={() => clearQuery()}
          >
            Clear
          </Button>
        </div>
        {toast ? (
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-foreground">{toast}</div>
        ) : null}
        <CommandList className="max-h-[min(60vh,420px)]">
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
                  onSelect={() => applyCardSearch(h.name)}
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
                    onClick={(e) => void markCardOwned(h, e)}
                    title="Add one NM copy (same as O when this row is highlighted)"
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

        </CommandList>
        <div className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
          Cards open as heatmap text search · <span className="font-mono">O</span> adds owned on highlighted card ·
          Enter runs the highlighted row
        </div>
      </Command>
    </CommandDialog>
  );
}
