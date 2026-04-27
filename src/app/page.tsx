import { Suspense } from "react";
import { HeatmapView } from "@/components/heatmap/HeatmapView";

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <HeatmapView />
    </Suspense>
  );
}
