"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppThemeProvider } from "@/components/app-theme-provider";
import { ClientErrorBoundary } from "@/components/client-error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <ClientErrorBoundary>
      <AppThemeProvider>
        <QueryClientProvider client={client}>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      </AppThemeProvider>
    </ClientErrorBoundary>
  );
}
