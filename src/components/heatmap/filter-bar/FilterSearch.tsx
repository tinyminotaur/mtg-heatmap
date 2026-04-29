"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
};

export function FilterSearch({
  value,
  onChange,
  placeholder = "Search cards…",
  debounceMs = 150,
  className,
}: Props) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef<string>(value);

  // Keep local input in sync when `q` changes from URL/back/forward.
  useEffect(() => {
    // Avoid clobbering fast typing with a slightly-stale URL echo.
    // Only sync when the change is external (e.g. back/forward / paste into URL).
    if (value === lastEmittedRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled sync from URL param `q`
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    lastEmittedRef.current = local;
    onChange(local);
  };

  const schedule = (next: string) => {
    setLocal(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastEmittedRef.current = next;
      onChange(next);
      timerRef.current = null;
    }, debounceMs);
  };

  return (
    <div className={cn("relative min-w-[200px] max-w-[min(100%,280px)] flex-1", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="heatmap-search"
        value={local}
        className="h-9 border-border/80 bg-muted/30 pl-8 pr-8 text-xs focus-visible:ring-1"
        placeholder={placeholder}
        aria-label="Search cards"
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            flush();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setLocal("");
            if (timerRef.current) clearTimeout(timerRef.current);
            lastEmittedRef.current = "";
            onChange("");
          }
        }}
      />
      {local ? (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
          onClick={() => {
            setLocal("");
            if (timerRef.current) clearTimeout(timerRef.current);
            lastEmittedRef.current = "";
            onChange("");
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
