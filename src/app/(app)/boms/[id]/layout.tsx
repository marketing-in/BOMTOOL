import { workflowFor } from "@/server/workflow";
import { BomStepRail, BomTopBar } from "@/components/bom/bom-section-nav";
import { WorkflowFooter } from "@/components/bom/workflow-footer";

/**
 * Every page of one BoM revision sits in its process: the steps down the left side, the BoM's name and its views
 * (Analysis, Supply chain, 3D view) on top, and Back / Next at the foot.
 */
export default async function BomLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = await workflowFor(id);
  if (!wf) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      <BomStepRail id={id} name={wf.name} states={wf.states} />
      <div className="min-w-0">
        <BomTopBar id={id} name={wf.name} />
        {children}
        <WorkflowFooter id={id} matchBlocked={wf.matchBlocked} />
      </div>
    </div>
  );
}
