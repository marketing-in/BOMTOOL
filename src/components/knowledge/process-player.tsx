"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Process } from "@/knowledge/processes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PcbCrossSection } from "./pcb-cross-section";

const STEP_MS = 3500;

/** Step-by-step process timeline. Arrow keys / buttons step; Play auto-advances. */
export function ProcessPlayer({ process }: { process: Process }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = process.steps.length;
  const go = useCallback((to: number) => setI(((to % n) + n) % n), [n]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (i === n - 1 ? setPlaying(false) : go(i + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, i, n, go]);

  const step = process.steps[i];
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      aria-label={`${process.title} process player`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
        if (e.key === " ") {
          e.preventDefault();
          setPlaying((p) => !p);
        }
      }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="mr-auto text-sm font-semibold">{process.title}</h2>
        <span className="num text-xs text-muted-foreground">
          {i + 1}/{n}
        </span>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Previous step" onClick={() => go(i - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-9" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Next step" onClick={() => go(i + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md bg-muted/40 p-3">
          {process.kind === "cross-section" ? <PcbCrossSection stage={i} /> : <StationStrip process={process} active={i} />}
        </div>
        <div aria-live="polite">
          <div className="text-xs text-muted-foreground">Step {i + 1}</div>
          <h3 className="mt-0.5 text-lg leading-snug font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
          {step.watch ? (
            <p className="mt-3 rounded-md border border-risk-amber/40 bg-risk-amber-soft px-3 py-2 text-sm">
              <span className="font-medium">Watch: </span>
              {step.watch}
            </p>
          ) : null}
        </div>
      </div>

      <ol className="flex gap-1 overflow-x-auto border-t px-3 py-2.5" aria-label="Steps">
        {process.steps.map((s, k) => (
          <li key={k} className="shrink-0">
            <button
              onClick={() => {
                setPlaying(false);
                go(k);
              }}
              aria-current={k === i ? "step" : undefined}
              className={cn(
                "h-8 rounded-md px-2 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                k === i ? "bg-primary text-primary-foreground" : k < i ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.short}
            </button>
          </li>
        ))}
      </ol>
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${((i + 1) / n) * 100}%` }} />
      </div>
    </section>
  );
}

/** A line of stations; the board icon sits under the active one. */
function StationStrip({ process, active }: { process: Process; active: number }) {
  const n = process.steps.length;
  const w = 640;
  const gap = w / n;
  return (
    <svg viewBox={`0 0 ${w} 220`} className="h-auto w-full" role="img" aria-label={`${process.steps[active].title} on the ${process.title}`}>
      {/* conveyor */}
      <rect x={8} y={150} width={w - 16} height={6} rx={3} fill="var(--border)" />
      {process.steps.map((s, k) => {
        const cx = gap * k + gap / 2;
        const on = k === active;
        const done = k < active;
        return (
          <g key={k}>
            <rect
              x={cx - gap / 2 + 4}
              y={60}
              width={gap - 8}
              height={84}
              rx={8}
              fill={on ? "var(--primary)" : "var(--card)"}
              stroke={on ? "var(--primary)" : "var(--border)"}
              style={{ transition: "fill 200ms ease-out, stroke 200ms ease-out" }}
            />
            <text x={cx} y={108} textAnchor="middle" fontSize={11} fontWeight={on ? 600 : 400} fill={on ? "var(--primary-foreground)" : done ? "var(--foreground)" : "var(--muted-foreground)"}>
              {s.short}
            </text>
            <text x={cx} y={48} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
              {k + 1}
            </text>
          </g>
        );
      })}
      {/* the board moving along the line */}
      <g style={{ transform: `translateX(${gap * active + gap / 2 - 22}px)`, transition: "transform 300ms ease-out" }}>
        <rect x={0} y={162} width={44} height={14} rx={2} fill="oklch(0.52 0.12 150)" />
        {[6, 16, 26, 34].map((x) => (
          <rect key={x} x={x} y={159} width={6} height={3} fill="oklch(0.45 0 0)" />
        ))}
      </g>
    </svg>
  );
}
