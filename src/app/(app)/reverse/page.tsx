import Link from "next/link";
import { ArrowRight, FileUp, Microscope, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Reverse engineering" };

export default async function ReverseIndexPage() {
  const user = await requireUser();
  const edit = can(user.role, "bom.write");
  const revisions = await db.bomRevision.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    include: { bom: { include: { project: { include: { customer: true } } } }, board: { select: { source: true, layerCount: true } }, _count: { select: { lines: true } } },
  });
  return (
    <>
      <PageHeader
        title="Reverse engineering"
        actions={
          edit ? (
            <>
              <Button asChild className="h-10">
                <Link href="/boms/new"><Upload className="size-4" /> Upload a BoM</Link>
              </Button>
              <Button asChild variant="outline" className="h-10">
                <Link href="/viewer/new"><FileUp className="size-4" /> Upload Gerbers</Link>
              </Button>
            </>
          ) : null
        }
      />
      <h2 className="sr-only">Products on file</h2>
      {revisions.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {revisions.map((r) => (
            <li key={r.id}>
              <Link href={`/boms/${r.id}/reverse`} className="group flex h-full flex-col rounded-xl border bg-card p-5 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="text-xs text-muted-foreground">{r.bom.project.customer.name}</span>
                <span className="font-medium">
                  {r.bom.name} <span className="num text-sm font-normal text-muted-foreground">rev {r.revision}</span>
                </span>
                <span className="mt-4 flex items-end gap-8">
                  <span>
                    <span className="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{r._count.lines}</span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">BoM lines</span>
                  </span>
                  <span>
                    <span className="block text-2xl leading-none font-semibold tracking-tight tabular-nums">{r.board ? r.board.layerCount : "—"}</span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">{r.board ? (r.board.source === "gerber" ? "layers, from Gerbers" : "layers") : "no board data"}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1 text-sm text-primary">
                    <Microscope className="size-4" aria-hidden /> <span className="sr-only">Reverse engineer</span>
                    <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No products yet">Upload a BoM or a set of Gerbers to start.</EmptyState>
      )}
    </>
  );
}
