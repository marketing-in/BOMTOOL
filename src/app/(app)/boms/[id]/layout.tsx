import { workflowFor } from "@/server/workflow";
import { BomSectionNav } from "@/components/bom/bom-section-nav";
import { WorkflowFooter } from "@/components/bom/workflow-footer";

/**
 * Every page of one BoM revision sits in its process: the numbered strip on top (files → can we build it → board →
 * components → box → quote → production) and Back / Next at the foot.
 */
export default async function BomLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = await workflowFor(id);
  return (
    <>
      {wf ? <BomSectionNav id={id} name={wf.name} states={wf.states} /> : null}
      {children}
      {wf ? <WorkflowFooter id={id} matchBlocked={wf.matchBlocked} /> : null}
    </>
  );
}
