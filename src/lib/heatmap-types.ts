/** Shared heatmap column metadata (kept separate from query module to avoid import cycles). */
export type ColumnMeta = {
  code: string;
  name: string;
  release_date: string | null;
  set_type: string | null;
  icon_svg_path: string | null;
  year: number | null;
};
