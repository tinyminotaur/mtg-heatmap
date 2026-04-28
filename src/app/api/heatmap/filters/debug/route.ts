import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";
import { parseFilters } from "@/lib/heatmap-query";
import { normalizeFilters } from "@/lib/heatmap/filters";
import { buildHaving, cardWhereClause } from "@/lib/heatmap/sql";
import { resolveHeatmapColumns } from "@/lib/heatmap-column-resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Debug endpoint for advanced filtering.
 *
 * Returns compiled SQL snippets and bound params for the current URL filter context.
 * This is intended for local development and future UI builders (validation/preview),
 * not for end-users.
 */
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const f = parseFilters(req.nextUrl.searchParams);
    const fx = normalizeFilters(f);
    const userId = LOCAL_USER_ID;

    const cardPred = cardWhereClause(fx);
    const havingNoPrice = buildHaving(fx, userId, { skipPrice: true });
    const physicalColumns = resolveHeatmapColumns(
      db,
      fx,
      cardPred.sql,
      cardPred.params,
      havingNoPrice.sql,
      havingNoPrice.params,
      userId,
    );
    const physicalSetCodes = physicalColumns.map((c) => c.code);
    const having = buildHaving(fx, userId, { priceSetCodes: physicalSetCodes });

    return NextResponse.json({
      ok: true,
      hasAdvancedFilters: Boolean(fx.advancedFilters),
      physicalSetCodesCount: physicalSetCodes.length,
      cardWhere: cardPred,
      having,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "debug_failed", message }, { status: 500 });
  }
}

