"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A picture that opens its details on a tap (Phase 25): the node of a process chain or a station of a line is the
 * button, and what it stands for is in the card that opens. Works by touch on the floor tablet and by keyboard.
 */
export function Tip({ label, className, children, content, align = "center" }: { label: string; className?: string; children: React.ReactNode; content: React.ReactNode; align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger aria-label={label} className={cn("cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 max-w-[calc(100vw-2rem)] space-y-1.5 p-3 text-sm leading-snug">
        {content}
      </PopoverContent>
    </Popover>
  );
}
