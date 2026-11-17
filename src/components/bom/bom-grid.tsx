"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronRight, Columns3, Loader2, Search, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import { selectMatch, switchToAlternate } from "@/app/(app)/boms/actions";
import { searchDistributorsForLine } from "@/app/(app)/sourcing/actions";
import { AddToCartButton, BidButton } from "@/components/sourcing/cart-buttons";
import { formatMoney, type Currency } from "@/lib/currency";
import { readIssue } from "@/lib/bom/issues";
import { SCORE_KEYS, SCORE_LABEL, type ScoreKey } from "@/lib/bom/scores";
import { scoreToRisk, SUPPLIER_KIND_LABEL } from "@/lib/risk";
import { LifecycleBadge, RiskDot, ScorePill, SupplierTierBadge } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GridRow } from "./types";

type QuickFilter = "all" | "red" | "review" | "short" | "issues";

const CONDITION_LABEL: Record<string, string> = {
  NEW_FACTORY_SEALED: "New sealed",
  NEW_OPEN_REEL: "New, open reel",
  NEW_PARTIAL: "New, partial",
  REFURBISHED: "Refurbished",
  USED: "Used",
};
const METHOD_LABEL: Record<string, string> = { EXACT: "Exact", NORMALISED: "Normalised", FUZZY: "Fuzzy", PARAMETRIC: "Parametric", MANUAL: "Manual" };
const ALT_LABEL: Record<string, string> = { DROP_IN: "Drop-in", PIN_TO_PIN: "Pin-to-pin", FUNCTIONAL: "Functional", UPGRADE: "Upgrade" };

const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const int = new Intl.NumberFormat("en-IN");

function ago(iso: string | null) {
  if (!iso) return "—";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function worstScore(r: GridRow) {
  return r.scores ? Math.min(...SCORE_KEYS.map((k) => r.scores![k])) : null;
}

const DEFAULT_HIDDEN: VisibilityState = { refDes: false, condition: false, lastUpdated: false, mfrLead: false, hsn: false, reach: false };

export function BomGrid({ rows, currency, editable, canBuy }: { rows: GridRow[]; currency: Currency; editable: boolean; canBuy: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [visibility, setVisibility] = useState<VisibilityState>(DEFAULT_HIDDEN);

  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, currency, { unit: true }));

  const counts = useMemo(
    () => ({
      all: rows.length,
      red: rows.filter((r) => (worstScore(r) ?? 100) < 40 || (!r.partId && !r.dnp)).length,
      review: rows.filter((r) => r.needsReview).length,
      short: rows.filter((r) => r.partId && !r.dnp && r.shortfall > 0).length,
      issues: rows.filter((r) => r.issues.length).length,
    }),
    [rows],
  );

  const data = useMemo(() => {
    switch (quick) {
      case "red":
        return rows.filter((r) => (worstScore(r) ?? 100) < 40 || (!r.partId && !r.dnp));
      case "review":
        return rows.filter((r) => r.needsReview);
      case "short":
        return rows.filter((r) => r.partId && !r.dnp && r.shortfall > 0);
      case "issues":
        return rows.filter((r) => r.issues.length);
      default:
        return rows;
    }
  }, [rows, quick]);

  const columns = useMemo<ColumnDef<GridRow>[]>(() => {
    const scoreCol = (k: ScoreKey): ColumnDef<GridRow> => ({
      id: k,
      header: SCORE_LABEL[k].slice(0, 5) === "Susta" ? "Sustain." : SCORE_LABEL[k],
      accessorFn: (r) => r.scores?.[k] ?? -1,
      cell: ({ row }) => (row.original.dnp ? <span className="text-xs text-muted-foreground">—</span> : <ScorePill score={row.original.scores?.[k] ?? null} label={SCORE_LABEL[k]} />),
      meta: { align: "center" },
    });
    return [
      {
        id: "expand",
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <button
            onClick={row.getToggleExpandedHandler()}
            aria-label={row.getIsExpanded() ? "Hide details" : "Show details"}
            aria-expanded={row.getIsExpanded()}
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("size-4 transition-transform duration-150", row.getIsExpanded() && "rotate-90")} />
          </button>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      { id: "lineNo", header: "#", accessorKey: "lineNo", cell: ({ getValue }) => <span className="num text-xs text-muted-foreground">{getValue<number>()}</span>, meta: { align: "right" }, enableHiding: false },
      {
        id: "mpn",
        header: "MPN",
        accessorFn: (r) => r.partMpn ?? r.rawMpn ?? "",
        enableHiding: false,
        cell: ({ row: { original: r } }) => (
          <div className="min-w-44">
            <div className="flex items-center gap-1.5">
              {r.partId ? (
                <Link href={`/parts/${r.partId}`} className="num font-medium hover:underline">{r.partMpn}</Link>
              ) : (
                <span className="num text-muted-foreground">{r.rawMpn ?? "no MPN"}</span>
              )}
              {r.dnp ? <span className="rounded bg-muted px-1 text-[10px] uppercase">DNP</span> : null}
              {!r.partId && !r.dnp ? <span className="rounded bg-risk-red-soft px-1 text-[10px]">Not found</span> : null}
              {r.partId && r.needsReview ? <span className="rounded bg-risk-amber-soft px-1 text-[10px]">Review</span> : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {r.manufacturer ?? r.rawManufacturer ?? ""}
              {r.partMpn && r.rawMpn && r.partMpn !== r.rawMpn ? <span title="As supplied"> · was {r.rawMpn}</span> : null}
            </div>
          </div>
        ),
      },
      { id: "description", header: "Description", accessorKey: "description", cell: ({ getValue }) => <div className="max-w-64 truncate text-xs text-muted-foreground" title={getValue<string>() ?? ""}>{getValue<string>()}</div> },
      { id: "refDes", header: "RefDes", accessorKey: "refDes", cell: ({ getValue }) => <div className="num max-w-40 truncate text-xs" title={getValue<string>() ?? ""}>{getValue<string>()}</div> },
      { id: "condition", header: "Condition", accessorFn: (r) => r.condition ?? "", cell: ({ row }) => <span className="text-xs whitespace-nowrap">{row.original.condition ? CONDITION_LABEL[row.original.condition] : "—"}</span> },
      { id: "qty", header: "Qty/brd", accessorKey: "qtyPerBoard", cell: ({ getValue }) => <span className="num">{getValue<number>()}</span>, meta: { align: "right" } },
      {
        id: "required",
        header: "Need",
        accessorKey: "required",
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="num" title={r.dnp ? "Not placed" : `incl. ${r.attritionPct}% attrition`}>{r.dnp ? "—" : int.format(r.required)}</span>
        ),
      },
      { id: "moq", header: "MOQ", accessorFn: (r) => r.moq ?? -1, cell: ({ row }) => <span className="num text-xs">{row.original.moq ?? "—"}</span>, meta: { align: "right" } },
      {
        id: "breaks",
        header: "Price breaks",
        enableSorting: false,
        cell: ({ row: { original: r } }) =>
          r.priceBreaks.length ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="num rounded px-1 text-xs whitespace-nowrap underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {r.priceBreaks.length} breaks
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="mb-1 text-[11px] opacity-70">{r.bestSupplier}</div>
                <table className="num text-xs">
                  <tbody>
                    {r.priceBreaks.map((b) => (
                      <tr key={b.qty}>
                        <td className="pr-3 text-right">{int.format(b.qty)}+</td>
                        <td className="text-right">{money(b.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      { id: "lastUpdated", header: "Updated", accessorFn: (r) => r.lastUpdated ?? "", cell: ({ row }) => <span className="text-xs whitespace-nowrap text-muted-foreground">{ago(row.original.lastUpdated)}</span> },
      {
        id: "stock",
        header: "Total stock",
        accessorKey: "totalStock",
        meta: { align: "right" },
        cell: ({ row: { original: r } }) =>
          r.partId ? (
            <span className="num inline-flex items-center gap-1.5" title={`Ours ${int.format(r.internalQty)} · channel partners ${int.format(r.partnerQty)} · excess ${int.format(r.excessQty)}`}>
              <RiskDot level={r.dnp ? "grey" : r.shortfall > 0 ? "red" : r.internalQty >= r.required ? "green" : "amber"} />
              {compact.format(r.totalStock)}
            </span>
          ) : (
            "—"
          ),
      },
      { id: "distributors", header: "Distrib.", accessorKey: "distributors", cell: ({ getValue }) => <span className="num">{getValue<number>()}</span>, meta: { align: "right" } },
      { id: "mfrLead", header: "Mfr LT", accessorFn: (r) => r.mfrLeadWeeks ?? -1, cell: ({ row }) => <span className="num text-xs">{row.original.mfrLeadWeeks ? `${row.original.mfrLeadWeeks} wk` : "—"}</span>, meta: { align: "right" } },
      { id: "factoryLead", header: "Factory LT", accessorFn: (r) => r.factoryLeadWeeks ?? -1, cell: ({ row }) => <span className="num text-xs">{row.original.factoryLeadWeeks ? `${row.original.factoryLeadWeeks} wk` : "—"}</span>, meta: { align: "right" } },
      {
        id: "best",
        header: "Best price",
        accessorFn: (r) => r.bestUnit ?? Infinity,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="num whitespace-nowrap" title={r.bestSupplier ?? ""}>
            {money(r.bestUnit)}
            {r.mock && r.bestUnit !== null ? <span className="ml-1 rounded bg-muted px-1 font-sans text-[10px] text-muted-foreground" title="Simulated market price">mock</span> : null}
          </span>
        ),
      },
      {
        id: "landed",
        header: "Landed",
        accessorFn: (r) => r.landedUnit ?? Infinity,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="num whitespace-nowrap" title="Per unit incl. freight, insurance and customs duty, net of GST/IGST input credit">{money(r.landedUnit)}</span>
        ),
      },
      {
        id: "plan",
        header: "Source",
        accessorFn: (r) => r.plan[0]?.tier ?? 9,
        cell: ({ row: { original: r } }) => {
          if (r.dnp || !r.partId) return <span className="text-xs text-muted-foreground">—</span>;
          const first = [...r.plan].sort((a, b) => b.qty - a.qty)[0];
          return first ? (
            <span className="text-xs whitespace-nowrap" title={r.plan.map((p) => `${SUPPLIER_KIND_LABEL[p.kind]}: ${int.format(p.qty)}`).join("\n")}>
              <span className="num mr-1 text-muted-foreground">T{first.tier}</span>
              {first.source}
              {r.plan.length > 1 ? <span className="text-muted-foreground"> +{r.plan.length - 1}</span> : null}
            </span>
          ) : (
            <span className="text-xs text-risk-red">No stock</span>
          );
        },
      },
      { id: "toBuy", header: "To buy (landed)", accessorKey: "toBuyLanded", cell: ({ row }) => <span className="num whitespace-nowrap">{row.original.toBuyLanded ? formatMoney(row.original.toBuyLanded, currency) : "—"}</span>, meta: { align: "right" } },
      { id: "lifecycle", header: "Lifecycle", accessorFn: (r) => r.lifecycle ?? "", cell: ({ row }) => (row.original.lifecycle ? <LifecycleBadge lifecycle={row.original.lifecycle} /> : null) },
      {
        id: "rohs",
        header: "RoHS",
        accessorFn: (r) => r.rohs ?? "",
        meta: { align: "center" },
        cell: ({ row: { original: r } }) => (r.rohs ? <RiskDot level={r.rohs === "COMPLIANT" ? "green" : r.rohs === "COMPLIANT_WITH_EXEMPTION" ? "amber" : r.rohs === "NON_COMPLIANT" ? "red" : "grey"} /> : null),
      },
      {
        id: "reach",
        header: "REACH",
        accessorFn: (r) => r.reach ?? "",
        meta: { align: "center" },
        cell: ({ row: { original: r } }) => (r.reach ? <RiskDot level={r.reach === "COMPLIANT" ? "green" : r.reach === "CONTAINS_SVHC" ? "amber" : "grey"} /> : null),
      },
      { id: "hsn", header: "HSN", accessorFn: (r) => r.hsn ?? "", cell: ({ row }) => <span className="num text-xs">{row.original.hsn ?? "—"}</span> },
      { id: "coc", header: "CoC", accessorFn: (r) => (r.coc ? 1 : 0), meta: { align: "center" }, cell: ({ row }) => (row.original.coc === null ? null : <RiskDot level={row.original.coc ? "green" : "red"} />) },
      ...SCORE_KEYS.map(scoreCol),
      {
        id: "issues",
        header: "Issues",
        accessorFn: (r) => r.issues.length,
        cell: ({ row: { original: r } }) => (
          <div className="flex flex-wrap gap-1">
            {r.issues.map((i) => {
              const issue = readIssue(i);
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <RiskDot level={issue.info?.level ?? "amber"} />
                      {issue.info?.label ?? issue.code}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">
                    {issue.detail ? <p className="font-medium">{issue.detail.charAt(0).toUpperCase() + issue.detail.slice(1)}.</p> : null}
                    <p>{issue.info?.help ?? issue.code}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row: { original: r } }) =>
          canBuy ? (
            <div className="flex gap-0.5">
              {r.cart ? <AddToCartButton item={{ ...r.cart, note: r.refDes ?? `line ${r.lineNo}` }} /> : null}
              {r.excess ? <BidButton item={{ partId: r.partId!, qty: r.excess.qty, supplierId: r.excess.supplierId, excessListingId: r.excess.excessListingId, bomLineId: r.id }} askPrice={r.excess.askPrice} currency={r.excess.currency} /> : null}
            </div>
          ) : null,
      },
    ];
  }, [currency, canBuy]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    globalFilterFn: (row, _id, value: string) => {
      const q = value.toLowerCase();
      const r = row.original;
      return [r.rawMpn, r.partMpn, r.manufacturer, r.rawManufacturer, r.description, r.refDes].some((v) => v?.toLowerCase().includes(q));
    },
  });

  const chips: { key: QuickFilter; label: string; level?: "red" | "amber" }[] = [
    { key: "all", label: "All lines" },
    { key: "red", label: "Red / not found", level: "red" },
    { key: "review", label: "Needs review", level: "amber" },
    { key: "short", label: "Short", level: "red" },
    { key: "issues", label: "Scrub issues", level: "amber" },
  ];

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter lines"
            className="h-9 w-full rounded-md border bg-card pr-3 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div role="radiogroup" aria-label="Quick filter" className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c.key}
              role="radio"
              aria-checked={quick === c.key}
              onClick={() => setQuick(c.key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                quick === c.key ? "bg-part-soft font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.level ? <RiskDot level={c.level} /> : null}
              {c.label}
              <span className="num opacity-60">{counts[c.key]}</span>
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-9">
              <Columns3 className="size-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                  {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* relative: keeps absolutely-positioned sr-only labels inside the scroll box (else they widen the page). */}
      <div className="relative overflow-x-auto">
        <table aria-label="BoM lines" className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        "px-2.5 py-2 font-normal whitespace-nowrap",
                        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                        h.column.id === "mpn" && "sticky left-0 z-10 bg-card",
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y">
            {table.getRowModel().rows.map((row) => {
              const worst = worstScore(row.original);
              return (
                <Fragment key={row.id}>
                  <tr className={cn("group transition-colors duration-150 hover:bg-muted/40", row.original.dnp && "opacity-60", row.getIsExpanded() && "bg-muted/30")}>
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-2.5 py-2 align-middle",
                            align === "right" ? "text-right" : align === "center" ? "text-center" : "",
                            cell.column.id === "mpn" && "sticky left-0 z-10 bg-card group-hover:bg-muted",
                            cell.column.id === "expand" && worst !== null && `border-l-2 ${scoreToRisk(worst) === "red" ? "border-l-risk-red" : scoreToRisk(worst) === "amber" ? "border-l-risk-amber" : "border-l-transparent"}`,
                            cell.column.id === "expand" && !row.original.partId && !row.original.dnp && "border-l-2 border-l-risk-red",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {row.getIsExpanded() ? (
                    <tr className="bg-muted/30">
                      <td colSpan={row.getVisibleCells().length} className="px-4 pt-1 pb-4">
                        <LineDetail row={row.original} money={money} editable={editable} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {table.getRowModel().rows.length === 0 ? <div className="px-6 py-10 text-center text-sm text-muted-foreground">No lines match this filter.</div> : null}
      </div>
    </div>
  );
}

function LineDetail({ row, money, editable }: { row: GridRow; money: (n: number | null) => string; editable: boolean }) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function swap(partId: string) {
    setBusyId(partId);
    start(async () => {
      const res = await switchToAlternate(row.id, partId);
      if (res?.error) toast.error(res.error);
      else toast.success("Line moved to the alternate and re-scored");
      setBusyId(null);
    });
  }

  function choose(partId: string | null) {
    setBusyId(partId ?? "none");
    start(async () => {
      const res = await selectMatch(row.id, partId);
      if (res?.error) toast.error(res.error);
      else toast.success(partId ? "Match updated and line re-scored" : "Match cleared");
      setBusyId(null);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border bg-card">
        <div className="flex h-9 items-center justify-between border-b px-3 text-xs font-medium">
          Match candidates
          {editable && row.partId ? (
            <button onClick={() => choose(null)} disabled={pending} className="font-normal text-muted-foreground hover:text-foreground">
              Clear match
            </button>
          ) : null}
        </div>
        {row.candidates.length ? (
          <ul className="divide-y text-sm">
            {row.candidates.map((c) => (
              <li key={c.partId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link href={`/parts/${c.partId}`} className="num font-medium hover:underline">{c.mpn}</Link>
                <span className="text-xs text-muted-foreground">{c.manufacturer}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{METHOD_LABEL[c.method]}</span>
                <span className="num text-xs text-muted-foreground">{c.confidence}%</span>
                <span className="ml-auto">
                  {c.selected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs"><RiskDot level="green" />Selected</span>
                  ) : editable ? (
                    <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => choose(c.partId)}>
                      {busyId === c.partId ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Use this
                    </Button>
                  ) : null}
                </span>
                {c.reason ? <p className="w-full text-xs text-muted-foreground">{c.reason}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3 px-3 py-4 text-sm text-muted-foreground">
            <p>No catalogue part matches “{row.rawMpn ?? row.description}”.</p>
            {editable && row.rawMpn ? <SearchDistributors lineId={row.id} /> : null}
          </div>
        )}
        {row.alternates.length ? (
          <>
            <div className="flex h-9 items-center border-y px-3 text-xs font-medium">Alternates for {row.partMpn}</div>
            <ul className="divide-y text-sm">
              {row.alternates.map((a) => (
                <li key={a.partId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <Link href={`/parts/${a.partId}`} className="num font-medium hover:underline">{a.mpn}</Link>
                  <span className="text-xs text-muted-foreground">{a.manufacturer}</span>
                  <span className="inline-flex items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    <RiskDot level={a.type === "FUNCTIONAL" ? "amber" : "green"} />
                    {ALT_LABEL[a.type]}
                    {a.approved ? " · approved" : ""}
                  </span>
                  <span className="num text-xs text-muted-foreground">{int.format(a.stock)} avail.</span>
                  <span className="num text-xs">{money(a.bestUnit)}</span>
                  <span className="ml-auto">
                    {editable ? (
                      <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => swap(a.partId)}>
                        {busyId === a.partId ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Use this
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="rounded-md border bg-card">
        <div className="flex h-9 items-center justify-between border-b px-3 text-xs font-medium">
          Sourcing plan for {int.format(row.required)} pcs
          {row.shortfall > 0 ? <span className="inline-flex items-center gap-1.5 font-normal text-risk-red"><RiskDot level="red" />{int.format(row.shortfall)} short</span> : null}
        </div>
        {row.plan.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {row.plan.map((p, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><SupplierTierBadge kind={p.kind} /></td>
                  <td className="px-3 py-2 text-xs">{p.source}</td>
                  <td className="num px-3 py-2 text-right">{int.format(p.qty)}</td>
                  <td className="num px-3 py-2 text-right text-xs text-muted-foreground">{p.orderQty ? `order ${int.format(p.orderQty)}` : "in hand"}</td>
                  <td className="num px-3 py-2 text-right whitespace-nowrap">{money(p.unit)}</td>
                  <td className="num px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground" title="Landed per unit, net of GST credit">{p.tier >= 3 ? money(p.landedUnit) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-4 text-sm text-muted-foreground">{row.dnp ? "Not placed on this build." : "Nothing to allocate yet."}</p>
        )}
      </div>
    </div>
  );
}

function SearchDistributors({ lineId }: { lineId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await searchDistributorsForLine(lineId);
          if (res?.error) toast.error(res.error);
          else toast.success(res?.message ?? "Found");
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <SearchCheck className="size-3.5" />}
      Search distributors
    </Button>
  );
}
