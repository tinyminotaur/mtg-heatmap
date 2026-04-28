/** Shared heatmap column metadata (kept separate from query module to avoid import cycles). */
export type ColumnMeta = {
  code: string;
  name: string;
  release_date: string | null;
  set_type: string | null;
  icon_svg_path: string | null;
  year: number | null;
  /** Block / parent set code when this edition is part of a larger release (Scryfall). */
  parent_set_code: string | null;
  /** Session quick-pin column (`qc=`); ignored for aggregate value-layout columns. */
  quick_pin_column?: boolean;
};
