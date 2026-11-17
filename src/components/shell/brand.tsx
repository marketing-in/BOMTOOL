import Image from "next/image";

/**
 * The ThinkSemi logo above the product name. `onDark` is for a panel that is dark in both themes (the login panel);
 * elsewhere the ink logo shows on light surfaces and the light one in dark mode. The mark's three strokes wear the
 * part colours (BoM pink, Factory orange, Engineering purple); no blue, at the user's request (2026-11-17).
 * The SVGs in /public/brand are redrawn from the logo artwork; replace them with the official files when to hand.
 */
export function Brand({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      {onDark ? null : <Image src="/brand/thinksemi-logo-dark.svg" alt="ThinkSemi" width={680} height={150} priority unoptimized className="h-7 w-auto self-start dark:hidden" />}
      <Image src="/brand/thinksemi-logo-light.svg" alt="ThinkSemi" width={680} height={150} priority unoptimized className={onDark ? "h-7 w-auto self-start" : "hidden h-7 w-auto self-start dark:block"} />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">EMS Sourcing</div>
        <div className={onDark ? "text-[11px] text-sidebar-foreground/70" : "text-[11px] text-muted-foreground"}>Sourcing intelligence</div>
      </div>
    </div>
  );
}
