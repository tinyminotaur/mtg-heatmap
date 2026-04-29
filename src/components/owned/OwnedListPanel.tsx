"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CollectionAddDialog } from "@/components/collection/CollectionAddDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONDITION_VALUE_MULT } from "@/lib/constants";
import {
  CARD_CONDITION_CODES,
  conditionKeyboardLabel,
  conditionOptionShortLabel,
  normalizeConditionCode,
} from "@/lib/card-condition";
import type { PortfolioSummary } from "@/lib/portfolio-summary";

type Row = {
  id: string;
  scryfall_id: string;
  condition: string;
  is_foil: number;
  purchase_price: number | null;
  acquired_date: string | null;
  notes: string | null;
  card_name: string;
  set_name: string;
  set_code: string;
  usd: number | null;
  usd_foil: number | null;
};

async function fetchList(): Promise<Row[]> {
  const res = await fetch("/api/owned/list");
  if (!res.ok) throw new Error("list");
  return res.json();
}

function toCsv(rows: Row[]): string {
  const header = [
    "card",
    "set_code",
    "set_name",
    "condition",
    "foil",
    "purchase_price",
    "current_usd",
    "adjusted_usd",
    "acquired_date",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cur = r.usd ?? r.usd_foil;
    const mult = CONDITION_VALUE_MULT[r.condition] ?? 1;
    const adj = cur != null ? (cur * mult).toFixed(2) : "";
    lines.push(
      [
        JSON.stringify(r.card_name),
        r.set_code,
        JSON.stringify(r.set_name),
        r.condition,
        r.is_foil ? "yes" : "no",
        r.purchase_price ?? "",
        cur ?? "",
        adj,
        r.acquired_date ?? "",
        JSON.stringify(r.notes ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export type OwnedListPanelProps = {
  /** When true, omit “Heatmap” nav link (shown as overlay over the heatmap). */
  embedded?: boolean;
  className?: string;
};

export function OwnedListPanel({ embedded = false, className }: OwnedListPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["owned-list"], queryFn: fetchList });
  const { data: summary } = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/summary");
      if (!res.ok) throw new Error();
      return res.json() as Promise<PortfolioSummary>;
    },
  });

  const patch = useMutation({
    mutationFn: async (payload: { id: string; condition: string }) => {
      const res = await fetch("/api/owned/list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owned-list"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/owned/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owned-list"] });
      qc.invalidateQueries({ queryKey: ["portfolio"] });
      qc.invalidateQueries({ queryKey: ["heatmap"] });
      qc.invalidateQueries({ queryKey: ["heatmap-facets"] });
    },
  });

  const csv = useMemo(() => (data ? toCsv(data) : ""), [data]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "owned.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <CollectionAddDialog mode="owned" open={addOpen} onOpenChange={setAddOpen} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Owned</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            One row per copy. Each row uses the printing&apos;s Scryfall Near Mint (NM) catalog price for USD or
            foil; &quot;Adj.&quot; multiplies that price by the condition factor (NM ×1.00, LP ×0.85, MP ×0.65, HP
            ×0.45, DMG ×0.25). Pick a condition below to see the factor spelled out.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} className="gap-1">
            <Plus className="size-3.5" aria-hidden />
            Add cards
          </Button>
          {!embedded ? (
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Heatmap
            </Link>
          ) : null}
          <Button size="sm" onClick={downloadCsv} disabled={!data?.length}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <div className="font-mono text-lg">
          Portfolio (adjusted):{" "}
          <span className="text-foreground">{summary ? `$${summary.total_usd.toFixed(2)}` : "—"}</span>
        </div>
        <p className="text-muted-foreground">{summary?.copies ?? 0} copies</p>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">Could not load owned list.</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Card</TableHead>
            <TableHead>Set</TableHead>
            <TableHead className="max-w-[14rem]">
              <span className="block">Condition</span>
              <span className="mt-0.5 block text-[10px] font-normal normal-case text-muted-foreground">
                × NM list price
              </span>
            </TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">
              <span className="block">Adj.</span>
              <span className="mt-0.5 block text-[10px] font-normal normal-case text-muted-foreground">
                after ×
              </span>
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No copies yet. Use <span className="font-medium text-foreground">Add cards</span> above, the heatmap
                with <span className="font-medium text-foreground">O</span> on a cell, or the command palette.
              </TableCell>
            </TableRow>
          ) : null}
          {(data ?? []).map((r) => {
            const cur = r.usd ?? r.usd_foil;
            const cond = normalizeConditionCode(r.condition);
            const mult = CONDITION_VALUE_MULT[cond] ?? 1;
            const adj = cur != null ? cur * mult : null;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.card_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.set_code} · {r.set_name}
                </TableCell>
                <TableCell className="max-w-[min(100vw-2rem,22rem)]">
                  <Select
                    value={cond}
                    onValueChange={(v) => {
                      if (v) patch.mutate({ id: r.id, condition: v });
                    }}
                  >
                    <SelectTrigger className="h-auto min-h-8 w-full max-w-full py-1.5 text-left text-xs leading-snug [&_*[data-slot=select-value]]:whitespace-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(100vw-1rem,24rem)]">
                      {CARD_CONDITION_CODES.map((c) => (
                        <SelectItem
                          key={c}
                          value={c}
                          label={conditionKeyboardLabel(c)}
                          className="items-start whitespace-normal py-2 [&_*]:whitespace-normal"
                        >
                          {conditionOptionShortLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {cur != null ? `$${cur.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {adj != null ? `$${adj.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => del.mutate(r.id)}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
