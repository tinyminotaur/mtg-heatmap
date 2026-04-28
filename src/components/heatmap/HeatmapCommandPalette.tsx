"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
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

type CardHit = { oracle_id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFilters: () => void;
  onOpenHelp: () => void;
  onApplySearch: (q: string) => void;
  /** When set (heatmap shell), open overlays instead of routing to full pages. */
  onNavigateOwned?: () => void;
  onNavigateWishlist?: () => void;
};

export function HeatmapCommandPalette({
  open,
  onOpenChange,
  onOpenFilters,
  onOpenHelp,
  onApplySearch,
  onNavigateOwned,
  onNavigateWishlist,
}: Props) {
  const router = useRouter();
  const [hits, setHits] = useState<CardHit[]>([]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) {
      setHits([]);
      return;
    }
    const data = (await res.json()) as { results: CardHit[] };
    setHits(data.results ?? []);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setHits([]);
        onOpenChange(v);
      }}
      title="Command palette"
      showCloseButton
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search cards or run a command…"
          onValueChange={(v) => {
            void runSearch(v);
          }}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Navigate">
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                router.push("/");
              }}
            >
              Heatmap home
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                if (onNavigateOwned) onNavigateOwned();
                else router.push("/owned");
              }}
            >
              Owned list
              <CommandShortcut>G O</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                if (onNavigateWishlist) onNavigateWishlist();
                else router.push("/watchlist");
              }}
            >
              Watchlist
              <CommandShortcut>G W</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenFilters();
              }}
            >
              Open filters
              <CommandShortcut>F</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                document.getElementById("heatmap-search")?.focus();
              }}
            >
              Focus search
              <CommandShortcut>/</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                onOpenHelp();
              }}
            >
              Keyboard shortcuts
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          {hits.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Cards">
                {hits.map((h) => (
                  <CommandItem
                    key={h.oracle_id}
                    value={`${h.name} ${h.oracle_id}`}
                    onSelect={() => {
                      onOpenChange(false);
                      onApplySearch(h.name);
                    }}
                  >
                    {h.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
