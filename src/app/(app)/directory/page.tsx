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
    { href: "/directory/pcb", icon: Layers, title: "PCB technologies & materials", count: PCB_TECHNOLOGIES.length + LAMINATES.length + FINISHES.length + BOARD_FEATURES.length, parts: [`${PCB_TECHNOLOGIES.length} technologies`, `${LAMINATES.length} laminates`, `${FINISHES.length} finishes`, `${BOARD_FEATURES.length} build features`] },
    { href: "/directory/board-types", icon: ListTree, title: "Board types", count: BOARD_TYPES.length, parts: [] as string[] },
    { href: "/directory/components", icon: Cpu, title: "Components", count: COMPONENT_FAMILIES.length + partMaster().length, parts: [`${COMPONENT_FAMILIES.length} families`, `${partMaster().length.toLocaleString("en-IN")} reference parts`] },
    { href: "/directory/boxes", icon: Box, title: "Box types & materials", count: BOX_TYPES.length + ENCLOSURE_MATERIALS.length + ENCLOSURE_FINISHES.length, parts: [`${BOX_TYPES.length} box types`, `${ENCLOSURE_MATERIALS.length} materials`, `${ENCLOSURE_FINISHES.length} finishes`] },
  ];
  return (
    <>
      <PageHeader title="Directory" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <Link key={c.href} href={c.href} className="group flex flex-col rounded-xl border bg-card p-6 outline-none transition-colors duration-150 hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center justify-between text-muted-foreground">
              <span className="num text-xs">{i + 1}</span>
              <c.icon className="size-5 text-primary" aria-hidden />
            </span>
            <span className="mt-6 block text-3xl leading-none font-semibold tracking-tight tabular-nums">{c.count.toLocaleString("en-IN")}</span>
            <span className="mt-2 block text-sm font-medium">{c.title}</span>
            {c.parts.length ? <span className="mt-1 block text-xs text-muted-foreground">{c.parts.join(" · ")}</span> : null}
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Board types and reference parts are reference data, not verified. Vendors marked “— sample” are placeholders.</p>
    </>
  );
}
