import Link from "next/link";
import { Columns3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { StepPage } from "@/components/bom/step-page";
import { columnsTakenFor } from "@/server/workflow";
import CompareSection from "../_sections/match";
import MismatchSection from "../_sections/mismatch";
import { openRevision, stepTitle } from "../_sections/guard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return stepTitle((await params).id, "Footprint & mismatch");
}

/** Step 3: the BoM against the board footprint by footprint, then every mismatch. */
export default async function FootprintStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await openRevision(id);
  // The upload took the columns without the mapping page: said once, quietly, with the way to check them for those
  // who may change them (the mapping page needs bom.write).
  const [user, taken] = await Promise.all([requireUser(), columnsTakenFor(id).catch(() => null)]);
  const mayMap = can(user.role, "bom.write");
  const note = taken ? (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <Columns3 className="size-4 shrink-0" aria-hidden />
      <span title={taken.columns.join(" · ") || undefined}>{taken.via === "template" ? "Columns read with the saved mapping" : "Columns read automatically"}</span>
      {mayMap ? (
        <>
          <span aria-hidden>·</span>
          <Link href={`/boms/${id}/map`} className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Check columns
          </Link>
        </>
      ) : null}
    </p>
  ) : null;
  return <StepPage step="footprint" note={note} sections={{ match: <CompareSection id={id} />, mismatch: <MismatchSection id={id} /> }} />;
}
