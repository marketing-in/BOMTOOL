"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full view for a 3D stage: the stage fills the whole screen and comes back. Uses the browser's full screen where
 * it exists; where it does not (an iPhone) the stage is pinned over the page instead, and Escape leaves it.
 *
 *   const fv = useFullView();
 *   <div ref={fv.ref} className={cn("relative h-[440px] …", fv.cls)}> … <FullViewButton {...fv} className="absolute …" /> </div>
 */
export function useFullView<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [native, setNative] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const on = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (!pinned) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = scroll;
      window.removeEventListener("keydown", key);
    };
  }, [pinned]);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (pinned) setPinned(false);
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => setPinned(true));
    else setPinned(true);
  };
  return {
    ref,
    full: native || pinned,
    toggle,
    /** Classes for the stage: it takes the whole screen while full. */
    cls: cn("[&:fullscreen]:!h-dvh [&:fullscreen]:w-dvw [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-background", pinned && "fixed inset-0 z-50 !h-dvh w-dvw rounded-none border-0 bg-background"),
  };
}

/** The button that goes with useFullView: 44 px to the touch on a tablet. */
export function FullViewButton({ full, toggle, className }: { full: boolean; toggle: () => void; className?: string }) {
  const label = full ? "Leave full view" : "Full view";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={full}
      aria-label={label}
      title={label}
      className={cn("grid size-10 place-items-center rounded-md border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {full ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
    </button>
  );
}

/** A 3D stage that is only a box round its canvas: the same box with a full-view button in its corner. */
export function FullViewStage({ className, children }: { className?: string; children: React.ReactNode }) {
  const fv = useFullView();
  return (
    <div ref={fv.ref} className={cn("relative", className, fv.cls)}>
      {children}
      <FullViewButton full={fv.full} toggle={fv.toggle} className="absolute top-2 right-2 z-10" />
    </div>
  );
}
