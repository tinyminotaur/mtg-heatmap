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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
