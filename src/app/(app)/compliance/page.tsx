import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { formatMoneyCompact } from "@/lib/currency";
import { complianceReport } from "@/server/compliance";
import { loadDutyRates } from "@/server/bom-pipeline";
import { PageHeader, Section, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { DutyTableEditor } from "@/components/ops/duty-table-editor";
import { cn } from "@/lib/utils";

export const metadata = { title: "Compliance" };

const ROHS: Record<string, { label: string; level: "green" | "amber" | "red" | "grey" }> = {
  COMPLIANT: { label: "Compliant", level: "green" },
  COMPLIANT_WITH_EXEMPTION: { label: "Exemption", level: "amber" },
  NON_COMPLIANT: { label: "Not compliant", level: "red" },
  UNKNOWN: { label: "Unknown", level: "grey" },
};

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ rev?: string }> }) {
  const user = await requireUser();
  const currency = await getDisplayCurrency();
  const revisions = await db.bomRevision.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, include: { bom: { include: { project: { include: { customer: true } } } } } });
  const { rev = revisions[0]?.id } = await searchParams;
  const [report, rates] = await Promise.all([rev ? complianceReport(rev, currency) : null, loadDutyRates(db)]);
  const s = report?.summary;

  return (
    <>
      <PageHeader
        title="Compliance & logistics"
        actions={
          rev ? (
            <Button asChild variant="outline" className="h-10">
              <a href={`/compliance/export?rev=${rev}`} download><Download className="size-4" /> Excel report</a>
            </Button>
          ) : null
        }
      />
      <form action="/compliance" className="mb-6 flex flex-wrap items-center gap-2">
        <label htmlFor="rev" className="sr-only">BoM revision</label>
        <select id="rev" name="rev" defaultValue={rev} className="h-10 min-w-72 rounded-md border bg-card px-3 text-sm">
          {revisions.map((r) => (
            <option key={r.id} value={r.id}>{r.bom.name} rev {r.revision} — {r.bom.project.customer.name}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" className="h-10">Show</Button>
      </form>

      {report && s ? (
        <>
          <dl className="mb-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                { label: "RoHS compliant", value: `${s.rohsCompliant}/${s.lines}`, note: `${s.rohsExempt} exempt · ${s.rohsNon} not · ${s.rohsUnknown} unknown`, tone: s.rohsNon ? "text-risk-red" : "", title: "With exemption · not compliant · unknown" },
                { label: "REACH SVHC", value: s.reachSvhc, note: `${s.reachUnknown} without declaration`, tone: s.reachSvhc ? "text-risk-amber" : "", title: undefined },
                { label: "Conflict minerals declared", value: `${s.conflictDeclared}/${s.lines}`, note: null, tone: "", title: "CMRT on file from the maker" },
                { label: "Export-controlled", value: s.controlled, note: null, tone: s.controlled ? "text-risk-amber" : "", title: "Lines with ECCN other than EAR99" },
                { label: "Est. customs duty", value: formatMoneyCompact(s.dutyEstimate, currency), note: null, tone: "", title: "BCD + SWS on imported buys" },
              ] as const
            ).map((k) => (
              <div key={k.label} title={k.title}>
                <dd className={cn("text-3xl leading-none font-semibold tracking-tight tabular-nums", k.tone)}>{k.value}</dd>
                <dt className="mt-1.5 text-xs text-muted-foreground">{k.label}</dt>
                {k.note ? <dd className="num mt-0.5 text-xs text-muted-foreground">{k.note}</dd> : null}
              </div>
            ))}
          </dl>

          <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-normal">#</th>
                      <th className="px-3 py-2 font-normal">Part</th>
                      <th className="px-3 py-2 font-normal">RoHS</th>
                      <th className="px-3 py-2 font-normal">REACH</th>
                      <th className="px-3 py-2 font-normal">3TG</th>
                      <th className="px-3 py-2 font-normal">ECCN</th>
                      <th className="px-3 py-2 font-normal">COO</th>
                      <th className="px-3 py-2 font-normal">HSN</th>
                      <th className="px-3 py-2 text-right font-normal">BCD</th>
                      <th className="px-3 py-2 font-normal">CoC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.rows.map((r) => (
                      <tr key={r.lineId}>
                        <td className="num px-3 py-2 text-xs text-muted-foreground">{r.lineNo}</td>
                        <td className="px-3 py-2">
                          <Link href={`/parts/${r.partId}`} className="num font-medium hover:underline">{r.mpn}</Link>
                          <div className="text-xs text-muted-foreground">{r.manufacturer}</div>
                        </td>
                        <td className="px-3 py-2 text-xs"><span className="inline-flex items-center gap-1.5"><RiskDot level={ROHS[r.rohs].level} />{ROHS[r.rohs].label}</span></td>
                        <td className="px-3 py-2 text-xs"><span className="inline-flex items-center gap-1.5"><RiskDot level={r.reach === "COMPLIANT" ? "green" : r.reach === "CONTAINS_SVHC" ? "amber" : "grey"} />{r.reach === "CONTAINS_SVHC" ? "SVHC" : r.reach === "COMPLIANT" ? "OK" : "?"}</span></td>
                        <td className="px-3 py-2 text-center"><RiskDot level={r.conflictMinerals ? "green" : "grey"} /></td>
                        <td className="num px-3 py-2 text-xs">{r.eccn ?? "—"}</td>
                        <td className="num px-3 py-2 text-xs">{r.coo ?? "—"}</td>
                        <td className="num px-3 py-2 text-xs">{r.hsn ?? "—"}</td>
                        <td className="num px-3 py-2 text-right text-xs">{r.bcdPct}%{r.dutyAssumed ? "*" : ""}</td>
                        <td className="px-3 py-2 text-center"><RiskDot level={r.cocMissing ? "red" : "green"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">* No HSN match: 10 % assumed · CoC red: a planned source has no certificate</p>
            </div>
            <aside className="space-y-6">
              <Section title="Country of origin">
                <ul className="space-y-2 px-4 py-3 text-sm">
                  {s.coo.map(([c, n]) => (
                    <li key={c} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2">
                      <span className="num">{c}</span>
                      <span className="h-2 overflow-hidden rounded-sm bg-muted"><span className="block h-full bg-primary" style={{ width: `${(n / s.lines) * 100}%` }} /></span>
                      <span className="num text-right text-xs text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Read more">
                <ul className="space-y-1.5 px-4 py-3 text-sm">
                  <li><Link href="/knowledge/rohs-reach" className="hover:underline">RoHS, REACH and conflict minerals</Link></li>
                  <li><Link href="/knowledge/counterfeit-risk" className="hover:underline">Counterfeit risk & CoC</Link></li>
                  <li><Link href="/sourcing/landed-cost" className="hover:underline">Landed-cost calculator</Link></li>
                </ul>
              </Section>
            </aside>
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-card"><EmptyState title="No BoM revisions yet" /></div>
      )}

      <Section title="HSN duty table (indicative)" className="mt-6">
        <DutyTableEditor rates={rates.map((r) => ({ prefix: r.prefix, description: r.description ?? "", bcdPct: r.bcdPct, igstPct: r.igstPct, note: r.note ?? "" }))} editable={can(user.role, "compliance.write")} />
      </Section>
    </>
  );
}
