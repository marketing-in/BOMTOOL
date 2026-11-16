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
        description="Pick a product and see what it is and how it works, read from its parts: the functional blocks, interfaces and supply rails, the parts that define it, and what is still missing before it could be rebuilt."
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
      <ol className="mb-6 grid gap-px overflow-hidden rounded-lg border bg-border text-sm sm:grid-cols-3">
        {[
          ["1", "Upload", "A BoM, or Gerbers that you then turn into a BoM with “Quote this board”."],
          ["2", "Open it here", "Every part is sorted into the job it does and the product is named."],
          ["3", "Read the gaps", "Firmware, netlist, obsolete parts: what a rebuild still needs from the customer."],
        ].map(([n, title, text]) => (
          <li key={n} className="flex gap-3 bg-card px-4 py-3">
            <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{n}</span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>

      <h2 className="mb-3 text-base font-medium">Products on file</h2>
      {revisions.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {revisions.map((r) => (
            <li key={r.id}>
              <Link href={`/boms/${r.id}/reverse`} className="group flex h-full flex-col rounded-lg border bg-card p-4 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
                <span className="text-xs text-muted-foreground">{r.bom.project.customer.name}</span>
                <span className="font-medium">
                  {r.bom.name} <span className="num text-sm font-normal text-muted-foreground">rev {r.revision}</span>
                </span>
                <span className="num mt-1 text-xs text-muted-foreground">
                  {r._count.lines} BoM lines · {r.board ? `${r.board.layerCount}-layer board${r.board.source === "gerber" ? " from Gerbers" : ""}` : "no board data"}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
                  <Microscope className="size-4" aria-hidden /> Reverse engineer <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
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
