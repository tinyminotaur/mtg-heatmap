"use client";

import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TriggerProps = ComponentProps<typeof TooltipTrigger>;

type Props = {
  children: ReactNode;
  /** Short lines shown as stacked paragraphs */
  tip: readonly string[] | string;
  side?: "top" | "bottom" | "left" | "right";
  /** Merged onto the hover target wrapper (Base UI Tooltip trigger) */
  className?: string;
};

export function FilterFieldTip({ children, tip, side = "bottom", className }: Props) {
  const lines = typeof tip === "string" ? [tip] : tip;
  const triggerProps = {
    nativeButton: false,
    closeOnClick: false,
    render: (props: ComponentPropsWithoutRef<"span">) => (
      <span
        {...props}
        className={cn(
          "inline-flex max-w-full cursor-help items-center",
          className,
          props.className,
        )}
      >
        {children}
      </span>
    ),
  } as unknown as TriggerProps;

  return (
    <Tooltip>
      <TooltipTrigger {...triggerProps} />
      <TooltipContent
        side={side}
        className="max-w-xs text-left text-xs font-normal normal-case leading-relaxed"
      >
        {lines.map((t, i) => (
          <p key={i} className={i > 0 ? "mt-2" : ""}>
            {t}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
