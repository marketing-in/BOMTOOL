import Link from "next/link";
import { Globe, LayoutGrid, List } from "lucide-react";

const TABS = [
  { key: "catalogue", href: "/parts", label: "Our catalogue", icon: List },
  { key: "browse", href: "/parts/browse", label: "Browse categories", icon: LayoutGrid },
  { key: "market", href: "/parts/market", label: "Search distributors", icon: Globe },
] as const;

export function PartsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Parts" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const Icon = t.icon;
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className="module-tab"
          >
            <Icon className="size-4" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
