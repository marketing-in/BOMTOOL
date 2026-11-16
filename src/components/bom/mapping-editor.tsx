"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { confirmMapping } from "@/app/(app)/boms/actions";
import { BOM_FIELDS, BOM_FIELD_LABEL, type BomField, type ColumnMapping } from "@/lib/bom/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  revisionId: string;
  rows: string[][];
  totalRows: number;
  initialHeaderRow: number;
  initialMapping: ColumnMapping;
  suggestions: ColumnMapping[];
  customerName: string;
};

const REQUIRED_HINT: Partial<Record<BomField, string>> = { mpn: "needed for matching", qty: "or RefDes" };

export function MappingEditor({ revisionId, rows, totalRows, initialHeaderRow, initialMapping, suggestions, customerName }: Props) {
  const [headerRow, setHeaderRow] = useState(initialHeaderRow);
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const header = rows[headerRow] ?? [];
  const preview = rows.slice(headerRow + 1, headerRow + 13);
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!mapping.includes("mpn") && !mapping.includes("description") && !mapping.includes("value")) m.push("MPN, Description or Value");
    if (!mapping.includes("qty") && !mapping.includes("refDes")) m.push("Qty or RefDes");
    return m;
  }, [mapping]);

  function setField(col: number, value: string) {
    const field = (value || null) as BomField | null;
    setMapping((prev) => prev.map((f, i) => (i === col ? field : f === field && field ? null : f)));
  }

  function changeHeader(row: number) {
    setHeaderRow(row);
    setMapping(suggestions[row] ?? rows[row].map(() => null));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <label className="flex max-w-full min-w-0 items-center gap-2">
          <span className="shrink-0 text-muted-foreground">Header row</span>
          <select value={headerRow} onChange={(e) => changeHeader(Number(e.target.value))} className="num h-9 max-w-full min-w-0 rounded-md border bg-background px-2 text-sm">
            {rows.slice(0, 20).map((r, i) => (
              <option key={i} value={i}>
                {i + 1}: {r.filter(Boolean).slice(0, 3).join(" · ").slice(0, 40)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {BOM_FIELDS.map((f) => (
            <span
              key={f}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs",
                mapping.includes(f) ? "bg-risk-green-soft text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {BOM_FIELD_LABEL[f]}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 align-top">
                {header.map((h, col) => (
                  <th key={col} className="min-w-40 px-3 py-2.5 text-left font-normal">
                    <div className="mb-1.5 truncate text-xs text-muted-foreground" title={h}>{h || <em>column {col + 1}</em>}</div>
                    <select
                      aria-label={`Field for column ${h || col + 1}`}
                      value={mapping[col] ?? ""}
                      onChange={(e) => setField(col, e.target.value)}
                      className={cn(
                        "h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        mapping[col] ? "border-primary/40 bg-primary/5 font-medium" : "bg-background text-muted-foreground",
                      )}
                    >
                      <option value="">Ignore</option>
                      {BOM_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {BOM_FIELD_LABEL[f]}
                          {REQUIRED_HINT[f] ? ` (${REQUIRED_HINT[f]})` : ""}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.map((r, i) => (
                <tr key={i}>
                  {header.map((_, col) => (
                    <td key={col} className={cn("max-w-56 truncate px-3 py-2", mapping[col] ? "" : "text-muted-foreground/60", mapping[col] === "mpn" && "num")} title={r[col]}>
                      {r[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Showing {preview.length} of {Math.max(0, totalRows - headerRow - 1)} data rows. Blank rows, section titles and totals are skipped automatically.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Remember this mapping for {customerName}
        </label>
        <div className="ml-auto flex items-center gap-3">
          {missing.length ? <span className="text-sm text-risk-red">Map {missing.join(" and ")}</span> : null}
          {error ? <span role="alert" className="text-sm text-destructive">{error}</span> : null}
          <Button
            className="h-10"
            disabled={pending || missing.length > 0}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await confirmMapping({ revisionId, headerRow, mapping, saveTemplate });
                if (res?.error) setError(res.error);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Matching parts…" : "Match & score BoM"}
          </Button>
        </div>
      </div>
    </div>
  );
}
