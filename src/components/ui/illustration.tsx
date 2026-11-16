import { cn } from "@/lib/utils";

/**
 * Small line drawings for upload, empty and sign-in screens. Plain SVG in the theme's own colours, so they
 * follow light and dark mode and cost nothing on a factory-floor tablet. Decorative: hidden from screen readers.
 */
type Kind = "board" | "sheet" | "shelf" | "bench";

const ink = "stroke-foreground/70";
const soft = "fill-primary/15";
const accent = "stroke-primary";

export function Illustration({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("h-28 w-auto", className)}>
      {kind === "board" ? (
        <>
          {/* A bare board with a chip, a few parts and traces, slightly off-square like a quick sketch. */}
          <path d="M26 30 L132 26 L136 92 L30 96 Z" className={cn(soft, ink)} />
          <rect x="62" y="46" width="30" height="26" rx="3" className={cn("fill-card", ink)} />
          <path d="M66 46v-7M74 46v-7M82 46v-7M66 72v7M74 72v7M82 72v7" className={ink} />
          <path d="M92 54h18l8 -8M92 64h14M62 58H46l-6 8" className={accent} />
          <circle cx="120" cy="44" r="3" className={accent} />
          <circle cx="38" cy="68" r="3" className={accent} />
          <rect x="104" y="72" width="16" height="9" rx="2" className={cn("fill-card", ink)} />
          <rect x="40" y="38" width="12" height="7" rx="2" className={cn("fill-card", ink)} />
          <circle cx="33" cy="89" r="2" className={ink} />
          <circle cx="129" cy="33" r="2" className={ink} />
        </>
      ) : kind === "sheet" ? (
        <>
          {/* A parts list on paper with a tick: the customer's BoM. */}
          <path d="M44 16h54l20 20v68H44z" className={cn(soft, ink)} />
          <path d="M98 16v20h20" className={ink} />
          <path d="M56 48h36M56 62h46M56 76h30" className={ink} />
          <path d="M56 90h20" className={accent} />
          <circle cx="112" cy="92" r="14" className={cn("fill-card", accent)} />
          <path d="M105 92l5 5 9 -10" className={accent} />
        </>
      ) : kind === "shelf" ? (
        <>
          {/* An empty stores shelf with one open box: nothing here yet. */}
          <path d="M22 100h116M30 100V30M130 100V30M30 62h100" className={ink} />
          <path d="M62 62V44l20 -6 20 6v18" className={cn(soft, ink)} />
          <path d="M62 44l20 6 20 -6M82 50v12" className={ink} />
          <path d="M70 34l-6 -8M94 34l6 -8M82 30V20" className={accent} />
        </>
      ) : (
        <>
          {/* A workbench: a board under a lamp, a reel beside it. */}
          <path d="M18 92h124M30 92v14M130 92v14" className={ink} />
          <path d="M52 86l8 -22h40l8 22z" className={cn(soft, ink)} />
          <rect x="70" y="70" width="20" height="10" rx="2" className={cn("fill-card", ink)} />
          <path d="M112 30l-22 14 6 8 22 -14zM118 26l14 -8M90 44l-4 12" className={ink} />
          <path d="M82 60l-6 6M92 60v8M102 58l6 6" className={accent} />
          <circle cx="34" cy="74" r="12" className={cn("fill-card", ink)} />
          <circle cx="34" cy="74" r="3.5" className={accent} />
        </>
      )}
    </svg>
  );
}
