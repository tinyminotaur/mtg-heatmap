"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { CollectionAddDialog } from "@/components/collection/CollectionAddDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  scryfall_id: string;
  added_at_price: number | null;
  alert_above: number | null;
  alert_below: number | null;
  card_name: string;
  set_name: string;
  set_code: string;
  usd: number | null;
  usd_foil: number | null;
};

async function fetchList(): Promise<Row[]> {
  const res = await fetch("/api/watchlist/list");
  if (!res.ok) throw new Error("list");
  return res.json();
}

export type WatchlistListPanelProps = {
  embedded?: boolean;
  className?: string;
};

export function WatchlistListPanel({ embedded = false, className }: WatchlistListPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["watchlist"], queryFn: fetchList });

  const patch = useMutation({
    mutationFn: async (payload: { id: string; alert_above?: number | null; alert_below?: number | null }) => {
      const res = await fetch(`/api/watchlist/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <CollectionAddDialog mode="watchlist" open={addOpen} onOpenChange={setAddOpen} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Watchlist</h1>
          <p className="text-sm text-muted-foreground">Track printings and price change since you added them.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} className="gap-1">
            <Plus className="size-3.5" aria-hidden />
            Add cards
          </Button>
          {!embedded ? (
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Heatmap
            </Link>
          ) : null}
        </div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">Could not load watchlist.</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card</TableHead>
            <TableHead>Set</TableHead>
            <TableHead className="text-right">Added at</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Δ%</TableHead>
            <TableHead>Alert above</TableHead>
            <TableHead>Alert below</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No printings on your watchlist yet. Use <span className="font-medium text-foreground">Add cards</span>{" "}
                above or add from the heatmap with <span className="font-medium text-foreground">W</span> on a cell.
              </TableCell>
            </TableRow>
          ) : null}
          {(data ?? []).map((r) => {
            const cur = r.usd ?? r.usd_foil;
            const base = r.added_at_price;
            const pct =
              base && cur != null && base !== 0 ? (((cur - base) / base) * 100).toFixed(1) : "—";
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.card_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.set_code} · {r.set_name}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {base != null ? `$${base.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {cur != null ? `$${cur.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{pct === "—" ? "—" : `${pct}%`}</TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    type="number"
                    defaultValue={r.alert_above ?? ""}
                    onBlur={(e) =>
                      patch.mutate({
                        id: r.id,
                        alert_above: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8"
                    type="number"
                    defaultValue={r.alert_below ?? ""}
                    onBlur={(e) =>
                      patch.mutate({
                        id: r.id,
                        alert_below: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
