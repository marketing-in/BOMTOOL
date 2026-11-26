import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, SectionHeading } from "@/components/data/page-header";
import { CompetitorEditor } from "@/components/validation/competitor-editor";
import { ConsumablesRegister } from "@/components/validation/consumables-register";
import { consumableRegister } from "@/server/validation";
import { registerAlerts } from "@/lib/validation/consumables";

export const metadata = { title: "BoM validation" };

/**
 * The BoM validation tool (Phase 46): the BoMs to validate, each customer's competitor list, and the consumables
 * register. A BoM's own validation is on its page (/boms/<id>/validation). Validation only: nothing is bought here.
 */
export default async function ValidationHome() {
  const user = await requireUser();
  const role = user.role as Role;
  const [revisions, customers, register] = await Promise.all([
    db.bomRevision.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        revision: true,
        createdAt: true,
        bom: { select: { name: true, project: { select: { customer: { select: { name: true } } } } } },
        board: { select: { source: true } },
        _count: { select: { lines: true, placements: true, validationCalls: true } },
      },
    }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, competitors: { select: { id: true, name: true, aliases: true }, orderBy: { name: "asc" } } } }),
    consumableRegister(),
  ]);
  const alerts = Object.fromEntries(registerAlerts(register).map((a) => [a.item.id, a.why]));
  const boards = revisions.map((r) => ({ id: r.id, label: `${r.bom.name} rev ${r.revision}` }));

  return (
    <div className="space-y-12">
      <PageHeader
        title="BoM validation"
        description="Check a customer's BoM and design files before production: footprints, pin counts, placement, availability, market visibility and the customer's competitor list. Upload the BoM with its pick-and-place (CPL / centroid) file and, when there are any, the Gerbers. Nothing is bought from here."
        actions={
          <Link href="/boms/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Upload className="size-4" aria-hidden /> Upload a BoM to validate
          </Link>
        }
      />

      <section aria-labelledby="boms" className="space-y-3">
        <SectionHeading id="boms" title="BoMs" />
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {revisions.map((r) => (
            <li key={r.id}>
              <Link href={`/boms/${r.id}/validation`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {r.bom.name} <span className="text-muted-foreground">rev {r.revision}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.bom.project.customer.name} · {r._count.lines} lines · {r._count.placements ? `${r._count.placements} placements` : "no placement file"}
                    {r.board?.source === "gerber" ? " · Gerbers" : ""}
                    {r._count.validationCalls ? ` · ${r._count.validationCalls} calls made` : ""}
                  </div>
                </div>
                <span className="num hidden text-xs text-muted-foreground sm:block">{r.createdAt.toISOString().slice(0, 10)}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
          {!revisions.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No BoMs yet.</li> : null}
        </ul>
      </section>

      <section aria-labelledby="competitors" className="space-y-3">
        <SectionHeading
          id="competitors"
          title="Competitor lists"
          info="Each customer's competitors: makers whose parts must not be on its boards. A BoM line using one is prohibited until a reviewer accepts it as a false call."
        />
        <div className="space-y-2">
          {customers.map((c) => (
            <details key={c.id} className="group rounded-xl border bg-card" open={customers.length === 1}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.competitors.length ? `${c.competitors.length} maker${c.competitors.length === 1 ? "" : "s"}` : "no list"}</span>
              </summary>
              <div className="border-t px-4 py-4">
                <CompetitorEditor customerId={c.id} customer={c.name} items={c.competitors} canEdit={can(role, "bom.write")} />
              </div>
            </details>
          ))}
        </div>
      </section>

      <section id="register" aria-labelledby="register-h" className="scroll-mt-28 space-y-3">
        <SectionHeading
          id="register-h"
          title="Consumables register"
          info="Solder paste, flux and stencils in our stores. Each BoM's validation checks its build against this: a stencil for every printed side, enough paste of the right powder, flux for the wave and for rework."
        />
        <ConsumablesRegister items={register} boards={boards} canEdit={can(role, "inventory.write")} alerts={alerts} />
      </section>
    </div>
  );
}
