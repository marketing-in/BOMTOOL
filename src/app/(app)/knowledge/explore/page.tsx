import Link from "next/link";
import { Cpu, Layers, Microchip } from "lucide-react";
import { PageHeader } from "@/components/data/page-header";
import { Explorer } from "@/components/explore/explorer-loader";
import { cn } from "@/lib/utils";

export const metadata = { title: "3D explorers" };

const VIEWS = [
  { key: "pcb", label: "PCB layer by layer", icon: Layers, blurb: "Copper, prepreg, core, mask and silk — with through, blind, buried and micro vias." },
  { key: "package", label: "Inside a chip package", icon: Cpu, blurb: "Die, bond wires, leadframe, substrate and solder balls, from SOIC to flip-chip BGA." },
  { key: "die", label: "Inside the silicon", icon: Microchip, blurb: "Transistors, contacts and the copper wiring stack up to the bond pads." },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ view?: string; preset?: string }> }) {
  const { view, preset } = await searchParams;
  const current: ViewKey = VIEWS.some((v) => v.key === view) ? (view as ViewKey) : "pcb";

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex gap-2">
            <Link href="/knowledge" className="hover:text-foreground">Knowledge</Link>
            <span aria-hidden>/</span>
            <span>3D explorers</span>
          </span>
        }
        title="Inside the board and the chip"
      />
      <nav aria-label="Explorers" className="mb-6 inline-flex max-w-full flex-wrap gap-1 rounded-lg border bg-card p-1">
        {VIEWS.map((v) => {
          const on = v.key === current;
          const Icon = v.icon;
          return (
            <Link
              key={v.key}
              href={`/knowledge/explore?view=${v.key}`}
              aria-current={on ? "page" : undefined}
              title={v.blurb}
              className={cn(
                "flex h-10 items-center gap-2 rounded-md px-3.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {v.label}
            </Link>
          );
        })}
      </nav>
      <Explorer key={`${current}-${preset ?? ""}`} view={current} preset={preset} />
    </>
  );
}
