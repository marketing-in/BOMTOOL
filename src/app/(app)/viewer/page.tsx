import Link from "next/link";
import { Boxes, FileUp, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { RiskDot } from "@/components/data/badges";
import { Button } from "@/components/ui/button";
import { DeleteQuickLookButton } from "@/components/bom/delete-controls";
import { MASK } from "@/components/viz/board-iso";

export const metadata = { title: "PCB / PCBA viewer" };

export default async function ViewerIndexPage() {
  const user = await requireUser();
  // A dev server started before `prisma generate` added BoardPreview has no delegate until it restarts.
  const previews = db.boardPreview
    ? await db.boardPreview.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, name: true, widthMm: true, heightMm: true, layerCount: true, maskColor: true, createdAt: true } })
    : [];
  const revisions = await db.bomRevision.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    include: { bom: { include: { project: { include: { customer: true } } } }, board: { select: { source: true, layerCount: true } }, _count: { select: { placements: true, lines: true } } },
  });
  return (
    <>
      <PageHeader
        title="PCB / PCBA / box-build viewer"
        actions={
          can(user.role, "bom.write") ? (
            <Button asChild className="h-10">
              <Link href="/viewer/new"><FileUp className="size-4" /> Quick look at Gerbers</Link>
            </Button>
          ) : null
        }
      />
      {previews.length ? (
        <section aria-labelledby="quick" className="mb-8">
          <h2 id="quick" className="mb-3 text-lg font-semibold tracking-tight">Quick looks</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {previews.map((b) => (
              <li key={b.id} className="relative">
                {can(user.role, "bom.write") ? <div className="absolute top-2 right-2 z-10"><DeleteQuickLookButton id={b.id} name={b.name} compact /></div> : null}
                <Link href={`/viewer/boards/${b.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 pr-12 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="size-10 shrink-0 rounded-md border" style={{ background: MASK[b.maskColor] ?? MASK.green }} title={`${b.maskColor} mask`} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{b.name}</span>
                    <span className="num mt-0.5 block text-xs text-muted-foreground">
                      {b.widthMm.toFixed(1)} × {b.heightMm.toFixed(1)} mm · {b.layerCount} layers · {b.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <h2 className="mb-3 text-lg font-semibold tracking-tight">BoM revisions</h2>
      {revisions.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {revisions.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card p-5">
              <div className="text-xs text-muted-foreground">{r.bom.project.customer.name}</div>
              <div className="font-medium">{r.bom.name} <span className="num text-sm font-normal text-muted-foreground">rev {r.revision}</span></div>
              <ul className="mt-3 space-y-1 text-xs">
                <li className="inline-flex items-center gap-1.5">
                  <RiskDot level={r.board?.source === "gerber" ? "green" : "grey"} />
                  {r.board?.source === "gerber" ? `Gerbers loaded (${r.board.layerCount} layers)` : "Board drawn from spec"}
                </li>
                <li className="flex items-center gap-1.5">
                  <RiskDot level={r._count.placements ? "green" : "grey"} />
                  {r._count.placements ? `${r._count.placements} placements from centroid` : "No centroid — approximate layout"}
                </li>
              </ul>
              <div className="mt-4 flex gap-2">
                <Button asChild className="h-9">
                  <Link href={`/boms/${r.id}/viewer`}><Boxes className="size-4" /> Open 3D</Link>
                </Button>
                {can(user.role, "bom.write") ? (
                  <Button asChild variant="outline" className="h-9">
                    <Link href={`/boms/${r.id}/board`}><Upload className="size-4" /> Gerbers & centroid</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card"><EmptyState title="No BoMs yet">Upload a BoM first.</EmptyState></div>
      )}
    </>
  );
}
