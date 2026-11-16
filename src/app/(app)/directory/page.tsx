import Link from "next/link";
import { Box, Cpu, Layers, ListTree } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/data/page-header";
import { PCB_TECHNOLOGIES } from "@/knowledge/pcb-technologies";
import { BOX_TYPES } from "@/knowledge/box-types";
import { BOARD_TYPES, partMaster } from "@/server/directory";
import { COMPONENT_FAMILIES } from "@/knowledge/component-families";
import { BOARD_FEATURES, FINISHES, LAMINATES } from "@/knowledge/pcb-materials";
import { ENCLOSURE_FINISHES, ENCLOSURE_MATERIALS } from "@/knowledge/enclosure-materials";

export const metadata = { title: "Directory" };

export default async function DirectoryPage() {
  await requireUser();
  const cards = [
    { href: "/directory/pcb", tone: "var(--risk-green)", icon: Layers, title: "PCB technologies & materials", count: PCB_TECHNOLOGIES.length + LAMINATES.length + FINISHES.length + BOARD_FEATURES.length, text: `${PCB_TECHNOLOGIES.length} board technologies with the fabs that build them, ${LAMINATES.length} laminates (Tg, Dk, Df, cost), ${FINISHES.length} surface finishes and ${BOARD_FEATURES.length} build features — copper, vias, mask, IPC class.` },
    { href: "/directory/board-types", tone: "var(--dir-blue)", icon: ListTree, title: "Board types", count: BOARD_TYPES.length, text: "What kinds of PCBA there are — MCU, power, motion, comms, computing, consumer — their sections, typical parts and review checks." },
    { href: "/directory/components", tone: "var(--primary)", icon: Cpu, title: "Components", count: COMPONENT_FAMILIES.length + partMaster().length, text: `${COMPONENT_FAMILIES.length} component families covering every kind of part, ${partMaster().length.toLocaleString("en-IN")} reference parts, our catalogue's stock — and a live search of every part the distributors list.` },
    { href: "/directory/boxes", tone: "var(--dir-slate)", icon: Box, title: "Box types & materials", count: BOX_TYPES.length + ENCLOSURE_MATERIALS.length + ENCLOSURE_FINISHES.length, text: `${BOX_TYPES.length} ways to house a product with our enclosures and the makers, ${ENCLOSURE_MATERIALS.length} materials (density, temperature, UL94, UV, shielding) and ${ENCLOSURE_FINISHES.length} surface finishes.` },
  ];
  return (
    <>
      <PageHeader title="Directory" description="Everything a product is made of, in build order: the bare board, the kind of board it is, its components and its box — each with who can supply it." />
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c, i) => (
          <Link key={c.href} href={c.href} style={{ "--tone": c.tone } as React.CSSProperties} className="group rounded-xl border bg-card p-6 transition-colors duration-150 hover:border-x-foreground/20 hover:border-b-foreground/20">
            <span className="flex items-center gap-3">
              <span className="text-[var(--tone)]"><c.icon className="size-5" aria-hidden /></span>
              <span>
                <span className="block text-xs text-muted-foreground">Step {i + 1}</span>
                <span className="block text-lg font-semibold">{c.title}</span>
              </span>
              <span className="num ml-auto text-2xl font-medium">{c.count.toLocaleString("en-IN")}</span>
            </span>
            <span className="mt-3 block text-sm text-muted-foreground">{c.text}</span>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Board types and the component reference list come from circuitflow (reference data, not verified purchasing data). Fabricators and box makers marked “— sample” are placeholders for your approved vendor list.</p>
    </>
  );
}
