import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check, CircleAlert, Download, TriangleAlert } from "lucide-react";
import type { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, SectionHeading } from "@/components/data/page-header";
import { Figures } from "@/components/bom/figures";
import { FlagsTable } from "@/components/validation/flags-table";
import { CompetitorEditor } from "@/components/validation/competitor-editor";
import { CHECK_LABEL, type Check as CheckKey } from "@/lib/validation/checks";
import { DISTRIBUTORS, consumablesFor, lookupStatus, validationFor } from "@/server/validation";
import { LookupPanel } from "@/components/validation/lookup-panel";
import { REAL_ADAPTERS, mockEnabled } from "@/server/sourcing";
import { cn } from "@/lib/utils";

export const metadata = { title: "BoM validation" };

const NEED_TONE = { ok: "text-risk-green", short: "text-risk-amber", check: "text-risk-amber", missing: "text-risk-red" } as const;
const NEED_WORD = { ok: "In stores", short: "Short", check: "Check", missing: "None on file" } as const;
const ADAPTER_OF: Record<string, string> = { digikey: "digikey", newark: "newark", element14: "element14", lcsc: "lcsc", mouser: "mouser" };

/**
 * The BoM and its design files checked before production (Phase 46): footprints, pin counts, placement,
 * availability, market visibility and the customer's competitor list — each flag accepted as a false call or
 * prohibited by a reviewer. Looking only: no carts, orders or RFQs from here.
 */
export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const data = await validationFor(id);
  if (!data) notFound();
  if (data.revision.status === "DRAFT") redirect(`/boms/${id}/map`);
  const [consumables, lookup] = await Promise.all([consumablesFor(id), lookupStatus(id)]);
  const role = user.role as Role;
  const canCall = can(role, "bom.write") || can(role, "compliance.write");
  const v = data.validation;
  const live = Object.fromEntries(REAL_ADAPTERS.map((a) => [a.key, a.configured()]));
  const simulated = mockEnabled();
  const checks = (Object.keys(CHECK_LABEL) as CheckKey[]).map((k) => ({ key: k, ...v.counts[k], skipped: v.skipped.find((s) => s.check === k)?.why ?? null }));

  return (
    <div className="space-y-10">
      <PageHeader
        title="Validation"
        description={`${data.revision.bom} rev ${data.revision.revision} for ${data.customer.name}, checked against its design files before production, for a build of ${data.revision.buildQty.toLocaleString("en-IN")}. Nothing is bought from here.`}
        actions={
          <a href={`/boms/${id}/validation/export`} className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted">
            <Download className="size-4" aria-hidden /> Export CSV
          </a>
        }
      />

      <section aria-label="Result" className="space-y-5">
        <div className={cn("flex items-center gap-2 text-lg font-semibold", v.ready ? "text-risk-green" : v.prohibited ? "text-risk-red" : "text-risk-amber")}>
          {v.ready ? <Check className="size-5" aria-hidden /> : v.prohibited ? <CircleAlert className="size-5" aria-hidden /> : <TriangleAlert className="size-5" aria-hidden />}
          {v.ready ? "Ready for production" : v.prohibited ? "Not ready: prohibited items to fix" : "Not ready: flags to settle"}
        </div>
        <Figures
          items={[
            { label: "Open", value: v.open, tone: v.open ? "amber" : "green" },
            { label: "Prohibited", value: v.prohibited, tone: v.prohibited ? "red" : "green" },
            { label: "Accepted as false calls", value: v.accepted },
            { label: "Lines", value: data.rows.length },
            { label: "Placements checked", value: data.revision.placements },
          ]}
        />
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {checks.map((c) => {
            const bad = c.open + c.prohibited;
            return (
              <li key={c.key} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{CHECK_LABEL[c.key]}</span>
                  {c.skipped ? (
                    <span className="text-xs text-muted-foreground">Not run</span>
                  ) : bad ? (
                    <span className={cn("text-xs font-medium", c.prohibited ? "text-risk-red" : "text-risk-amber")}>
                      {c.open ? `${c.open} open` : ""}
                      {c.open && c.prohibited ? " · " : ""}
                      {c.prohibited ? `${c.prohibited} prohibited` : ""}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-risk-green">Clear{c.accepted ? ` · ${c.accepted} accepted` : ""}</span>
                  )}
                </div>
                {c.skipped ? <p className="mt-1 text-xs text-muted-foreground">{c.skipped}</p> : null}
              </li>
            );
          })}
        </ul>
        <LookupPanel revisionId={id} view={lookup} canRun={can(role, "bom.write")} />
        {!data.revision.hasBoard && !data.revision.placements ? (
          <p className="text-sm text-muted-foreground">
            No board files yet.{" "}
            <Link href={`/boms/${id}/board`} className="font-medium text-foreground underline-offset-4 hover:underline">
              Add Gerbers or a placement file
            </Link>{" "}
            to check footprints, pins and placement.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="flags" className="space-y-3">
        <SectionHeading
          id="flags"
          title="Flags and calls"
          info="A flag that is not a real problem is a false call: accept it and say why. One that must be fixed before production is prohibited. Parts from a maker on the customer's competitor list start prohibited."
        />
        <FlagsTable revisionId={id} flags={v.flags} canCall={canCall} />
      </section>

      <section aria-labelledby="dist" className="space-y-3">
        <SectionHeading id="dist" title="Distributors" info="Stock each distributor lists for the line's part, from the last price refresh.">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {DISTRIBUTORS.map((d) => {
              const state = live[ADAPTER_OF[d.key]] ? "live" : simulated ? "simulated" : "no key";
              return (
                <li key={d.key} className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", state === "live" ? "bg-risk-green" : state === "simulated" ? "bg-risk-amber" : "bg-muted-foreground/40")} aria-hidden />
                  {d.label} <span className="sr-only">:</span>
                  <span className="text-muted-foreground/80">{state}</span>
                </li>
              );
            })}
          </ul>
        </SectionHeading>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Line</th>
                <th className="px-4 py-2.5 font-medium">Part</th>
                <th className="px-4 py-2.5 text-right font-medium">Need</th>
                {DISTRIBUTORS.map((d) => (
                  <th key={d.key} className="px-4 py-2.5 text-right font-medium">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.lineNo} className={cn("border-t align-top", r.dnp && "text-muted-foreground")}>
                  <td className="px-4 py-2.5">
                    <div className="num">{r.lineNo}</div>
                    <div className="max-w-[10rem] truncate text-xs text-muted-foreground" title={r.refDes}>
                      {r.refDes}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="num font-medium">{r.mpn ?? "No part number"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.manufacturer ?? "—"}
                      {r.matched && r.matched.mpn.toUpperCase() !== (r.mpn ?? "").toUpperCase() ? (
                        <>
                          {" · matched to "}
                          <Link href={`/parts/${r.matched.id}`} className="underline-offset-4 hover:underline">
                            {r.matched.mpn}
                          </Link>
                          {r.matched.confirmed ? "" : " (to confirm)"}
                        </>
                      ) : null}
                      {r.dnp ? " · not fitted" : ""}
                    </div>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{r.dnp ? "—" : r.need.toLocaleString("en-IN")}</td>
                  {DISTRIBUTORS.map((d) => {
                    const s = r.stock[d.key];
                    return (
                      <td key={d.key} className={cn("num px-4 py-2.5 text-right", s === null ? "text-muted-foreground/60" : s === 0 ? "text-risk-amber" : !r.dnp && s < r.need ? "text-risk-amber" : "")}>
                        {s === null ? "—" : s.toLocaleString("en-IN")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cons" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="cons" className="text-lg font-semibold">
            Consumables for this build
          </h2>
          <Link href="/validation#register" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Consumables register →
          </Link>
        </div>
        {consumables ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {consumables.needs.map((n) => (
              <li key={n.key} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{n.label}</span>
                  <span className={cn("text-xs font-medium", NEED_TONE[n.status])}>{NEED_WORD[n.status]}</span>
                </div>
                <div className="num mt-1 text-sm">
                  {n.need !== null ? `${n.need.toLocaleString("en-IN")} ${n.unit} needed · ` : ""}
                  {n.have.toLocaleString("en-IN")} {n.unit} on file
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Needs the board and its parts first.</p>
        )}
      </section>

      <section aria-labelledby="comp" className="space-y-3">
        <h2 id="comp" className="text-lg font-semibold">
          {data.customer.name}&apos;s competitor list
        </h2>
        <CompetitorEditor customerId={data.customer.id} customer={data.customer.name} items={data.competitors} canEdit={can(role, "bom.write")} />
      </section>
    </div>
  );
}
