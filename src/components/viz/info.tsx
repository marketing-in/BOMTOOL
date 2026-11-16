"use client";

import { Info as InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The small print behind an ⓘ (Phase 25): one tap or Enter opens it, so a screen can show the figure and keep the
 * explanation out of the way. `label` names what it explains ("About the pin count").
 */
export function Info({ label, children, className, align = "start" }: { label: string; children: React.ReactNode; className?: string; align?: "start" | "center" | "end" }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          // The dot is small to look at; the invisible border around it makes it a full fingertip to tap.
          "relative inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground outline-none transition-colors duration-150 before:absolute before:-inset-2 before:content-[''] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <InfoIcon className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3 text-sm leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}
