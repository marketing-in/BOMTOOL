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
        description="Take a PCB and a chip apart layer by layer: what each layer is, how it is made and what it means for assembly on our lines."
      />
      <nav aria-label="Explorers" className="mb-5 grid gap-2 sm:grid-cols-3">
        {VIEWS.map((v) => {
          const on = v.key === current;
          const Icon = v.icon;
          return (
            <Link
              key={v.key}
              href={`/knowledge/explore?view=${v.key}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex gap-3 rounded-lg border p-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary/40 bg-primary/8" : "bg-card hover:border-foreground/20",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{v.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{v.blurb}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <Explorer key={`${current}-${preset ?? ""}`} view={current} preset={preset} />
    </>
  );
}
