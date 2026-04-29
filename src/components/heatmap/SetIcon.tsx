"use client";

import { useState } from "react";
import { resolveSetIconSvgUrl } from "@/lib/set-icon-url";
import { cn } from "@/lib/utils";

export function SetIcon({
  code,
  iconPath,
  className,
  size = 18,
}: {
  code: string;
  iconPath: string | null;
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = resolveSetIconSvgUrl(code, iconPath);
  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded border border-border bg-muted font-mono text-[9px] font-semibold uppercase text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        title={code}
      >
        {code.slice(0, 3)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded border border-border bg-white shadow-sm ring-1 ring-black/5 dark:border-zinc-500/70 dark:bg-zinc-100 dark:ring-white/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="max-h-[82%] max-w-[82%] object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
