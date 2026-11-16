"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Layer = { kind: "mask" | "copper" | "prepreg" | "core"; label: string; mm: number; role?: string };

const OZ_MM: Record<string, number> = { "0.5": 0.0175, "1": 0.035, "2": 0.07 };
const ROLES: Record<number, string[]> = {
  2: ["Signal + GND pour", "Signal + GND pour"],
  4: ["Signal", "GND plane", "Power plane", "Signal"],
  6: ["Signal", "GND", "Signal", "Signal", "Power", "Signal"],
  8: ["Signal", "GND", "Signal", "Power", "GND", "Signal", "GND", "Signal"],
  10: ["Signal", "GND", "Signal", "Signal", "Power", "GND", "Signal", "Signal", "GND", "Signal"],
};

/** Builds a symmetric stack of n copper layers to a ~1.6 mm finish. */
function buildStack(n: number, outerOz: string, innerOz: string, target = 1.6): Layer[] {
  const outer = OZ_MM[outerOz] + 0.025; // + plating
  const inner = OZ_MM[innerOz];
  const copperTotal = 2 * outer + (n - 2) * inner + 2 * 0.02; // + mask
  const dielectrics = n - 1;
  const d = Math.max(0.06, (target - copperTotal) / dielectrics);
  const roles = ROLES[n];
  const layers: Layer[] = [{ kind: "mask", label: "Solder mask", mm: 0.02 }];
  for (let k = 0; k < n; k++) {
    layers.push({ kind: "copper", label: `L${k + 1}`, mm: k === 0 || k === n - 1 ? outer : inner, role: roles[k] });
    if (k < n - 1) {
      // Cores sit between pairs of inner layers (2-3, 4-5 …); prepreg elsewhere.
      const isCore = n === 2 || k % 2 === 1;
      layers.push({ kind: isCore ? "core" : "prepreg", label: isCore ? "Core" : "Prepreg", mm: d });
    }
  }
  layers.push({ kind: "mask", label: "Solder mask", mm: 0.02 });
  return layers;
}

const FILL: Record<Layer["kind"], string> = {
  mask: "oklch(0.52 0.12 150)",
  copper: "oklch(0.68 0.13 55)",
  prepreg: "oklch(0.86 0.06 95)",
  core: "oklch(0.78 0.08 95)",
};

const sel = "h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function StackupExplorer({ initialLayers = 4 }: { initialLayers?: number }) {
  const [n, setN] = useState(ROLES[initialLayers] ? initialLayers : 4);
  const [outerOz, setOuter] = useState("1");
  const [innerOz, setInner] = useState("0.5");
  const layers = useMemo(() => buildStack(n, outerOz, innerOz), [n, outerOz, innerOz]);
  const total = layers.reduce((s, l) => s + l.mm, 0);

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-sm">
        <h2 className="mr-auto font-medium">Stack-up explorer</h2>
        <label className="flex items-center gap-1.5">
          Layers
          <select value={n} onChange={(e) => setN(Number(e.target.value))} className={sel}>
            {[2, 4, 6, 8, 10].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Outer
          <select value={outerOz} onChange={(e) => setOuter(e.target.value)} className={sel}>
            {Object.keys(OZ_MM).map((x) => (
              <option key={x} value={x}>{x} oz</option>
            ))}
          </select>
        </label>
        {n > 2 ? (
          <label className="flex items-center gap-1.5">
            Inner
            <select value={innerOz} onChange={(e) => setInner(e.target.value)} className={sel}>
              {Object.keys(OZ_MM).map((x) => (
                <option key={x} value={x}>{x} oz</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="p-4">
        <ol className="space-y-px" aria-label={`${n}-layer stack-up`}>
          {layers.map((l, k) => (
            <li key={k} className="grid grid-cols-[1fr_9rem_5rem] items-center gap-3">
              <div
                className={cn("rounded-[2px] transition-[height] duration-200 ease-out")}
                style={{ background: FILL[l.kind], height: Math.max(4, Math.round(l.mm * 120)) }}
              />
              <span className="truncate text-xs">
                <span className={l.kind === "copper" ? "font-medium" : "text-muted-foreground"}>{l.label}</span>
                {l.role ? <span className="text-muted-foreground"> · {l.role}</span> : null}
              </span>
              <span className="num text-right text-xs text-muted-foreground">{(l.mm * 1000).toFixed(0)} µm</span>
            </li>
          ))}
        </ol>
        <p className="num mt-3 text-xs text-muted-foreground">
          ≈ {total.toFixed(2)} mm finished · symmetric · dielectrics shown evenly — your fab sets exact prepreg/core choices for impedance.
        </p>
      </div>
    </section>
  );
}
