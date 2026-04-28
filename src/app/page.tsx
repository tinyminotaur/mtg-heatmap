import { Suspense } from "react";
import { HeatmapView } from "@/components/heatmap/HeatmapView";

export default function Home() {
  return (
    <div className="flex h-dvh max-h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <HeatmapView />
        </div>
      </Suspense>
    </div>
  );
}
