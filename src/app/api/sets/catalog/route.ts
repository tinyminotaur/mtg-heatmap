import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { POC_RELEASE_CUTOFF } from "@/lib/constants";
import { COLUMN_EXCLUDE_GROUP_PRESETS } from "@/lib/set-column-groups";

export const dynamic = "force-dynamic";

export type CatalogSet = {
  code: string;
  name: string;
  set_type: string | null;
  icon_svg_path: string | null;
  release_date: string | null;
};

/** All sets in POC range for filter UI (icons, grouping, hide columns). */
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const sp = req.nextUrl.searchParams;
    const includeDigital = sp.get("digital") === "1";
    const q = (sp.get("q") ?? "").trim().toLowerCase();

    const baseParams: unknown[] = [POC_RELEASE_CUTOFF];
    let typeSql = `
      SELECT DISTINCT set_type FROM sets
      WHERE (release_date IS NULL OR release_date <= ?)
    `;
    if (!includeDigital) typeSql += ` AND is_digital = 0`;
    typeSql += ` ORDER BY set_type`;
    const typeRows = db.prepare(typeSql).all(...baseParams) as { set_type: string | null }[];
    const setTypes = typeRows.map((r) => r.set_type).filter((t): t is string => Boolean(t));

    let sql = `
      SELECT code, name, set_type, icon_svg_path, release_date
      FROM sets
      WHERE (release_date IS NULL OR release_date <= ?)
    `;
    const params: unknown[] = [POC_RELEASE_CUTOFF];
    if (!includeDigital) sql += ` AND is_digital = 0`;
    if (q.length >= 1) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ` ORDER BY release_date ASC, code ASC`;

    const sets = db.prepare(sql).all(...params) as CatalogSet[];
    const groups = Object.entries(COLUMN_EXCLUDE_GROUP_PRESETS).map(([id, g]) => ({
      id,
      label: g.label,
      description: g.description,
      setTypes: g.setTypes,
    }));

    return NextResponse.json({ sets, setTypes, groups });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "catalog_failed" }, { status: 500 });
  }
}
