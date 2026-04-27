"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { ClientErrorBoundary } from "@/components/client-error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";

function ClientBootSignal() {
  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7544/ingest/d3bac746-7f30-4189-a378-b3d32ca27dd5", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e53e3b" },
      body: JSON.stringify({
        sessionId: "e53e3b",
        hypothesisId: "H_providers_boot",
        location: "providers.tsx:ClientBootSignal",
        message: "client providers subtree mounted",
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <ClientErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={client}>
          <ClientBootSignal />
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ClientErrorBoundary>
  );
}
