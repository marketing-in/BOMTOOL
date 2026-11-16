import Link from "next/link";
import { ArrowRight, Box, CircuitBoard, LibraryBig } from "lucide-react";
import { DICTIONARY_STATS, GROUPS } from "@/knowledge/dictionary";
import { CIRCUITS, circuitById } from "@/knowledge/circuits";
import { Schematic } from "@/components/knowledge/schematic";
import { StackIllustration } from "@/components/home/stack-illustration";
import { GROUP_ICON } from "@/components/dictionary/group-icon";

/** A way into the knowledge base as a picture: the art on top, the name and a figure under it. */
function PictureCard({ href, icon, title, meta, art, children }: { href: string; icon: React.ReactNode; title: string; meta: string; art: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border bg-card outline-none transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="grid h-32 place-items-center border-b bg-muted/30 px-4">{art}</div>
      <div className="flex flex-1 flex-col p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="text-primary">{icon}</span>
          {title}
          <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </span>
        {children ? <span className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</span> : null}
        <span className="num mt-2 text-xs text-muted-foreground">{meta}</span>
      </div>
    </Link>
  );
}

/**
 * The three ways into the knowledge base — the dictionary, the application circuits, the 3D explorers — each drawn
 * with what is inside it (Phase 28: shared by Home and the Knowledge screen). `lines` adds one line of words.
 */
export function KnowledgeEntrances({ lines = false }: { lines?: boolean }) {
  const demo = circuitById("ldo");
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <PictureCard
        href="/knowledge/dictionary"
        icon={<LibraryBig className="size-4" aria-hidden />}
        title="Component & machine dictionary"
        meta={`${DICTIONARY_STATS.entries} entries · ${DICTIONARY_STATS.machines} machines`}
        art={
          <div className="grid grid-cols-7 gap-1.5 px-1">
            {GROUPS.slice(0, 21).map((g) => {
              const Icon = GROUP_ICON[g.key];
              return (
                <span key={g.key} title={g.label} className="grid aspect-square place-items-center rounded-md bg-primary/8 text-primary">
                  <Icon className="size-3.5" aria-hidden />
                </span>
              );
            })}
          </div>
        }
      >
        {lines ? "What each part does, how to choose one and what can replace it." : null}
      </PictureCard>
      <PictureCard
        href="/knowledge/circuits"
        icon={<CircuitBoard className="size-4" aria-hidden />}
        title="Application circuits"
        meta={`${CIRCUITS.length} reference circuits`}
        art={demo ? <Schematic circuit={demo} focus="ldo-regulator" className="mx-auto max-h-24" /> : null}
      >
        {lines ? "How regulators, drivers and interfaces are actually wired." : null}
      </PictureCard>
      <PictureCard href="/knowledge/explore" icon={<Box className="size-4" aria-hidden />} title="3D explorers" meta="PCB · packages · silicon" art={<StackIllustration className="mx-auto h-24 w-auto" />}>
        {lines ? "Take a board and a chip apart, layer by layer." : null}
      </PictureCard>
    </div>
  );
}
