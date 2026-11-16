"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** One level up: /boms/x/build/parts → /boms/x/build. Used when there is no page to go back to. */
export function parentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
}

/**
 * Back, on every page: the page you came from, or one level up when this page was opened directly
 * (a bookmark, a link from an e-mail, a new tab).
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <button
      type="button"
      onClick={() => {
        // A tab opened on this page has nothing behind it; history.length is 1 or 2 depending on the browser.
        const cameFromApp = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
        if (window.history.length > 2 || cameFromApp) router.back();
        else router.push(parentPath(pathname));
      }}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Back to the previous page"
    >
      <ArrowLeft className="size-4" aria-hidden />
      <span className="hidden sm:inline">Back</span>
    </button>
  );
}
