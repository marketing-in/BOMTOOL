import { cn } from "@/lib/utils";

/** One button of a segmented control in the viewer. */
export const seg = (active: boolean) =>
  cn(
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] px-3 text-sm transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
