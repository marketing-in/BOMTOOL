import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { QuickLookForm } from "@/components/viewer/quick-look-form";

export const metadata = { title: "Quick look at Gerbers" };

export default async function QuickLookPage() {
  await requireUser("bom.write");
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/viewer" className="hover:text-foreground">Viewer</Link>}
        title="Quick look at a board"
        description="Gerbers in, 3D board out — no BoM needed. The components are read off the files (or guessed from the pads), the bare board is priced, and Quote this board turns them into a BoM. Check the outline, layers, mask and finish before quoting or releasing to the fab."
      />
      <QuickLookForm />
    </>
  );
}
