import type { Lifecycle, SupplierKind } from "@prisma/client";
import { cn } from "@/lib/utils";
import { LIFECYCLE_LABEL, LIFECYCLE_RISK, SUPPLIER_KIND_LABEL, SUPPLIER_TIER, scoreToRisk, type RiskLevel } from "@/lib/risk";

const DOT: Record<RiskLevel, string> = {
  green: "bg-risk-green",
  amber: "bg-risk-amber",
  red: "bg-risk-red",
  grey: "bg-risk-grey",
};

const PILL: Record<RiskLevel, string> = {
  green: "bg-risk-green-soft text-foreground",
  amber: "bg-risk-amber-soft text-foreground",
  red: "bg-risk-red-soft text-foreground",
  grey: "bg-muted text-muted-foreground",
};

export function RiskDot({ level, className }: { level: RiskLevel; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[level], className)} />;
}

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const level = LIFECYCLE_RISK[lifecycle];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs whitespace-nowrap", PILL[level])}>
      <RiskDot level={level} />
      {LIFECYCLE_LABEL[lifecycle]}
    </span>
  );
}

/** 0–100 score shown as a coloured pill; null renders as a dash (not yet scored). */
export function ScorePill({ score, label }: { score: number | null | undefined; label?: string }) {
  const level = scoreToRisk(score);
  return (
    <span
      title={label}
      className={cn("num inline-flex h-6 min-w-10 items-center justify-center gap-1.5 rounded-full px-2 text-xs", PILL[level])}
    >
      <RiskDot level={level} />
      {score ?? "—"}
    </span>
  );
}

export function SupplierTierBadge({ kind }: { kind: SupplierKind }) {
  const tier = SUPPLIER_TIER[kind];
  const level: RiskLevel = tier <= 3 ? "green" : tier === 4 ? "grey" : "red";
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs whitespace-nowrap", PILL[level])}>
      <span className="num text-[10px] opacity-70">T{tier}</span>
      {SUPPLIER_KIND_LABEL[kind]}
    </span>
  );
}
