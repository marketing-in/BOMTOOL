import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { WoCreateForm } from "@/components/ops/wo-create-form";
import { WO_STATUS } from "@/lib/ops/labels";

export const metadata = { title: "Work orders" };

export default async function WorkOrdersPage() {
  const user = await requireUser();
  const [wos, revisions, lines] = await Promise.all([
    db.workOrder.findMany({
      orderBy: [{ status: "asc" }, { plannedStart: "asc" }],
      include: { project: { include: { customer: true } }, line: true, bomRevision: { include: { bom: true } } },
    }),
    db.bomRevision.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, include: { bom: { include: { project: { include: { customer: true } } } } } }),
    db.line.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Work orders" description="Builds planned on our lines, with clear-to-build from stock and reservations." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-lg border bg-card">
          {wos.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 font-normal">WO</th>
                    <th className="px-4 py-2.5 font-normal">Assembly</th>
                    <th className="px-4 py-2.5 text-right font-normal">Qty</th>
                    <th className="px-4 py-2.5 font-normal">Line</th>
                    <th className="px-4 py-2.5 font-normal">Start</th>
                    <th className="px-4 py-2.5 font-normal">Status</th>
                    <th className="px-4 py-2.5 text-right font-normal">Clear to build</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {wos.map((w) => (
                    <tr key={w.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5"><Link href={`/operations/work-orders/${w.id}`} className="num font-medium hover:underline">{w.number}</Link></td>
                      <td className="px-4 py-2.5">
                        {w.bomRevision.bom.name} <span className="num text-xs text-muted-foreground">rev {w.bomRevision.revision}</span>
                        <div className="text-xs text-muted-foreground">{w.project.customer.name}</div>
                      </td>
                      <td className="num px-4 py-2.5 text-right">{w.buildQty.toLocaleString("en-IN")}</td>
                      <td className="num px-4 py-2.5 text-xs">{w.line?.code ?? "—"}</td>
                      <td className="num px-4 py-2.5 text-xs">{w.plannedStart?.toISOString().slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs"><span className="inline-flex items-center gap-1.5"><RiskDot level={WO_STATUS[w.status].level} />{WO_STATUS[w.status].label}</span></td>
                      <td className="num px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <RiskDot level={(w.clearToBuildPct ?? 0) >= 100 ? "green" : (w.clearToBuildPct ?? 0) >= 80 ? "amber" : "red"} />
                          {w.clearToBuildPct ?? "—"}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No work orders">Create one from a BoM revision.</EmptyState>
          )}
        </div>
        {can(user.role, "workorder.write") ? (
          <WoCreateForm
            revisions={revisions.map((r) => ({ id: r.id, label: `${r.bom.name} rev ${r.revision} — ${r.bom.project.customer.name}`, buildQty: r.buildQty }))}
            lines={lines.map((l) => ({ id: l.id, label: `${l.code} · ${l.name.replace(/^.*—\s*/, "")}` }))}
          />
        ) : null}
      </div>
    </>
  );
}
