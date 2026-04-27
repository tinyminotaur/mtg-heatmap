"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "theme";

type Resolved = "light" | "dark";

type ThemeContextValue = {
  theme: string;
  setTheme: (theme: string) => void;
  resolvedTheme: Resolved;
  themes: string[];
  systemTheme: Resolved | undefined;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystem(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyClass(resolved: Resolved) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

/** Theme without an inline `<script>` (avoids React 19 “script in component” console noise from next-themes). */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>("dark");
  const [system, setSystem] = useState<Resolved>("dark");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(readSystem());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // One-time read of persisted theme after mount (avoid SSR/localStorage mismatch in useState init).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync theme from localStorage + system once after mount */
    setSystem(readSystem());
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const resolvedTheme: Resolved = theme === "system" ? system : theme === "light" ? "light" : "dark";

  useEffect(() => {
    applyClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: string) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      themes: ["light", "dark", "system"],
      systemTheme: system,
    }),
    [theme, setTheme, resolvedTheme, system],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Drop-in subset of next-themes `useTheme()` for this app. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      setTheme: () => {},
      resolvedTheme: "dark",
      themes: ["light", "dark", "system"],
      systemTheme: "dark",
    };
  }
  return ctx;
}
