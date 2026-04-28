"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
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
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["owned-list"], queryFn: fetchList });
  const { data: summary } = useQuery({
    queryKey: ["portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/portfolio/summary");
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ total_usd: number; copies: number }>;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Owned</h1>
          <p className="text-sm text-muted-foreground">
            One row per copy · condition adjusts value (NM=1.0, LP=0.85, …)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            <TableHead>Condition</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Adj.</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).map((r) => {
            const cur = r.usd ?? r.usd_foil;
            const mult = CONDITION_VALUE_MULT[r.condition] ?? 1;
            const adj = cur != null ? cur * mult : null;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.card_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.set_code} · {r.set_name}
                </TableCell>
                <TableCell>
                  <Select
                    value={r.condition}
                    onValueChange={(v) => {
                      if (v) patch.mutate({ id: r.id, condition: v });
                    }}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["NM", "LP", "MP", "HP", "DMG"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
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
