import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/data/page-header";
import { UploadForm } from "@/components/bom/upload-form";
import { groupFound, type FoundParts } from "@/lib/board/find-parts";

export const metadata = { title: "Upload BoM" };

export default async function NewBomPage({ searchParams }: { searchParams: Promise<{ bom?: string; board?: string }> }) {
  const user = await requireUser();
  const { bom: bomId, board: previewId } = await searchParams;
  const [customers, projects, existing, preview] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ orderBy: { name: "asc" }, select: { name: true, customerId: true, boms: { select: { name: true } } } }),
    bomId
      ? db.bom.findUnique({ where: { id: bomId }, include: { project: true, revisions: { select: { revision: true }, orderBy: { createdAt: "asc" } } } })
      : null,
    previewId ? db.boardPreview.findUnique({ where: { id: previewId }, select: { id: true, name: true, layerCount: true, widthMm: true, heightMm: true, components: true } }) : null,
  ]);

  // Suggest the next revision letter/number when uploading a new revision of an existing BoM.
  const lastRev = existing?.revisions.at(-1)?.revision;
  const nextRev = !lastRev ? "A" : /^[A-Y]$/i.test(lastRev) ? String.fromCharCode(lastRev.toUpperCase().charCodeAt(0) + 1) : /^\d+$/.test(lastRev) ? String(Number(lastRev) + 1) : "";
  const found = (preview?.components ?? null) as FoundParts | null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/boms" className="hover:text-foreground">BoMs</Link>}
        title={existing ? `New revision of ${existing.name}` : "Upload BoM or Gerbers"}
        description="Add both files of the board. The footprints in the BoM are checked against the pads on the Gerbers first; when they match, our machines are checked next."
      />
      {can(user.role, "bom.write") ? (
        <UploadForm
          customers={customers}
          projects={projects.map((p) => ({ name: p.name, customerId: p.customerId, boms: p.boms.map((b) => b.name) }))}
          preview={
            preview
              ? {
                  id: preview.id,
                  name: preview.name,
                  summary: `${preview.layerCount} layers · ${preview.widthMm.toFixed(1)} × ${preview.heightMm.toFixed(1)} mm`,
                  components: found?.parts.length ? { parts: found.parts.length, lines: groupFound(found.parts).length, guessed: found.source === "guessed" } : null,
                }
              : null
          }
          defaults={
            existing
              ? { customerId: existing.project.customerId, project: existing.project.name, bomName: existing.name, revision: nextRev, stage: existing.project.stage }
              : { revision: "A", stage: "PROTOTYPE", project: preview?.name }
          }
        />
      ) : (
        <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">Your role can view BoMs but not upload them. Ask purchasing or engineering.</p>
      )}
    </>
  );
}
