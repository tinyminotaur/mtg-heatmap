"use client";

import { useEffect } from "react";

export function ManaFontPreload() {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (globalThis as any).document?.fonts as FontFaceSet | undefined;
      if (!fonts?.load) return;
      try {
        await fonts.load('15px "Mana"');
        await fonts.load('13px "Mana"');
        await fonts.ready;
      } catch {
        return;
      }
      if (cancelled) return;
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

