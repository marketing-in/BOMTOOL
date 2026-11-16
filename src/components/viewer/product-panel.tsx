"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Package2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { boxVerdict, type KitStatus } from "@/lib/board/box";
import type { Shell } from "./enclosure";
import type { ViewerData } from "./types";
import { seg } from "./ui";

const SHELLS: { key: Shell; label: string }[] = [
  { key: "closed", label: "Closed" },
  { key: "exploded", label: "Exploded" },
  { key: "xray", label: "X-ray" },
];

const STATUS: Record<KitStatus, { icon: typeof Check; tone: string; note: string }> = {
  "in-bom": { icon: Check, tone: "text-risk-green", note: "On the BoM" },
  supplied: {
    icon: Package2,
    tone: "text-muted-foreground",
    note: "Comes with the enclosure",
  },
  missing: {
    icon: AlertTriangle,
    tone: "text-risk-amber",
    note: "Not on the BoM",
  },
  nre: { icon: Wrench, tone: "text-risk-amber", note: "One-off job to quote" },
  check: {
    icon: AlertTriangle,
    tone: "text-risk-amber",
    note: "Design question",
  },
};

const mm = (n: number) => `${+n.toFixed(1)} mm`;

/** One sentence on whether the board goes in the box, and if not, what stops it. */
export function fitVerdict(data: ViewerData): { ok: boolean; text: string } | null {
  return data.enclosure && data.box ? boxVerdict(data.enclosure, data.box) : null;
}

export function ProductPanel({ data, shell, onShell, explode, onExplode }: { data: ViewerData; shell: Shell; onShell: (s: Shell) => void; explode: number; onExplode: (v: number) => void }) {
  const enc = data.enclosure;
  const box = data.box;
  if (!enc || !box) return null;
  const verdict = fitVerdict(data)!;
  const missing = box.kit.filter((k) => k.status === "missing" || k.status === "check").length;
  const mount =
    box.mount === "slots" ? `In the side slots, ${mm(box.standoff)} up` : `${mm(box.standoff)} standoffs (${box.standoffSource === "bom" ? "length from the BoM" : "to clear the solder side"})`;
  const facts: [string, ReactNode][] = [
    [
      "Enclosure",
      enc.partId ? (
        <Link href={`/parts/${enc.partId}`} className="num hover:underline">
          {enc.mpn}
        </Link>
      ) : (
        <span className="num">{enc.mpn}</span>
      ),
    ],
    ["Type", enc.label.replace(enc.mpn, "").replace("Hammond", "").trim() || enc.style],
    ["Outer", `${+enc.length.toFixed(1)} × ${+enc.width.toFixed(1)} × ${+enc.height.toFixed(1)} mm`],
    ["Inner", `${+(enc.length - 2 * enc.wall).toFixed(1)} × ${+(enc.width - 2 * enc.wall).toFixed(1)} mm`],
    ["Board mount", mount],
    ["IP rating", enc.ipRating ?? "—"],
  ];

  return (
    <section className="rounded-lg border bg-card p-4" aria-labelledby="product-title">
      {data.product ? (
        <>
          <h2 id="product-title" className="text-sm font-medium">
            {data.product.name}
          </h2>
          <p className="num mt-0.5 text-xs text-muted-foreground">
            {data.product.partNumber ?? "No assembly P/N"} · rev {data.product.revision} · {data.product.customer}
          </p>
        </>
      ) : (
        <h2 id="product-title" className="text-sm font-medium">
          Complete product
        </h2>
      )}

      <div role="radiogroup" aria-label="Enclosure view" className="mt-3 grid grid-cols-3 rounded-md border bg-muted p-0.5">
        {SHELLS.map((s) => (
          <button key={s.key} role="radio" aria-checked={shell === s.key} className={seg(shell === s.key)} onClick={() => onShell(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {shell === "exploded" ? (
        <label className="mt-3 block text-sm">
          Explode
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => onExplode(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--primary)]"
            aria-label="Explode distance"
          />
        </label>
      ) : null}

      <p className={cn("mt-3 flex items-start gap-1.5 text-xs", verdict.ok ? "text-risk-green" : "text-risk-red")}>
        {verdict.ok ? <Check className="mt-px size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />}
        <span>{verdict.text}</span>
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium">Box-build kit</h3>
        {missing ? <span className="text-xs text-risk-amber">{missing} to sort out</span> : <span className="text-xs text-risk-green">complete</span>}
      </div>
      <ul className="mt-2 space-y-2">
        {box.kit.map((k) => {
          const s = STATUS[k.status];
          const Icon = s.icon;
          return (
            <li key={k.key} className="flex gap-2">
              <Icon className={cn("mt-0.5 size-3.5 shrink-0", s.tone)} aria-label={s.note} />
              <div className="min-w-0">
                <div className="text-sm leading-snug">
                  {k.label}
                  {k.qty > 1 ? <span className="num text-muted-foreground"> ×{k.qty}</span> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {k.line ? (
                    <>
                      {k.line.refDes} ·{" "}
                      {k.line.partId ? (
                        <Link href={`/parts/${k.line.partId}`} className="num hover:text-foreground hover:underline">
                          {k.line.mpn}
                        </Link>
                      ) : (
                        <span className="num">{k.line.mpn}</span>
                      )}
                    </>
                  ) : (
                    k.why
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link href="/knowledge/box-build-process" className="text-muted-foreground hover:text-foreground">
          How box-build works →
        </Link>
        <Link href="/knowledge/enclosure-types" className="text-muted-foreground hover:text-foreground">
          Enclosure types →
        </Link>
      </div>
    </section>
  );
}
