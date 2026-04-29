import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getHeatmapData, parseFilters } from "@/lib/heatmap-query";
import { requireUserId } from "@/lib/require-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const f = parseFilters(req.nextUrl.searchParams);
    const userId = await requireUserId();
    const data = await getHeatmapData(db, f, userId);

    const cols = data.columns.map((c) => c.code);
    const header = [
      "oracle_id",
      "name",
      "cmc",
      "type_line",
      "is_reserved",
      "printings_count",
      "owned_qty",
      "watchlisted",
      "pinned",
      ...cols.flatMap((code) => [`${code}_scryfall_id`, `${code}_rarity`, `${code}_price`]),
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    const cellPriceField = f.cellPriceField ?? "usd";
    for (const row of data.rows) {
      const out: unknown[] = [
        row.oracle_id,
        row.name,
        row.cmc ?? "",
        row.type_line ?? "",
        row.is_reserved ? 1 : 0,
        row.printings_count,
        row.owned_qty,
        row.watchlisted ? 1 : 0,
        row.pinned ? 1 : 0,
      ];

      for (let i = 0; i < cols.length; i++) {
        const cell = row.cells[i];
        if (!cell) {
          out.push("", "", "");
          continue;
        }
        const price =
          cellPriceField === "eur"
            ? cell.eur
            : cellPriceField === "tix"
              ? cell.tix
              : cellPriceField === "usd_foil"
                ? cell.usd_foil ?? cell.usd
                : cell.usd;
        out.push(cell.scryfall_id, cell.rarity ?? "", price ?? "");
      }

      lines.push(out.map(csvEscape).join(","));
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="heatmap.csv"`,
      },
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "export_failed", message }, { status: 500 });
  }
}

