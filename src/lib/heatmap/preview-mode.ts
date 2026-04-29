/** URL `pv=` — how the floating card preview is triggered (Space always previews the selected cell). */
export type HeatmapPreviewMode = "auto" | "click" | "row" | "cell" | "space";

const MODES: HeatmapPreviewMode[] = ["auto", "click", "row", "cell", "space"];

export function parsePreviewMode(sp: URLSearchParams): HeatmapPreviewMode {
  const v = (sp.get("pv") ?? "").trim().toLowerCase();
  return MODES.includes(v as HeatmapPreviewMode) ? (v as HeatmapPreviewMode) : "auto";
}

/** Settings → URL `pv=` */
export const PREVIEW_MODE_OPTIONS: { value: HeatmapPreviewMode; label: string }[] = [
  { value: "auto", label: "Preview: hover cells & rows" },
  { value: "click", label: "Preview: click cell only" },
  { value: "row", label: "Preview: name column only" },
  { value: "cell", label: "Preview: grid cells only" },
  { value: "space", label: "Preview: Space key only" },
];

export function previewModeLabel(m: HeatmapPreviewMode): string {
  switch (m) {
    case "auto":
      return "Preview: cells & rows (hover)";
    case "click":
      return "Preview: click cell only";
    case "row":
      return "Preview: name column only";
    case "cell":
      return "Preview: grid cells only";
    case "space":
      return "Preview: Space only";
    default:
      return "Preview";
  }
}
