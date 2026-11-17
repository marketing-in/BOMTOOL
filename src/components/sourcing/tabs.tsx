"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/sourcing", label: "Overview", exact: true },
  { href: "/sourcing/cart", label: "Cart", count: "cart" as const },
  { href: "/sourcing/rfqs", label: "RFQs", count: "rfqs" as const },
  { href: "/sourcing/pos", label: "PO drafts", count: "pos" as const },
  { href: "/sourcing/chat", label: "Seller chat" },
  { href: "/sourcing/price-lists", label: "Price lists" },
  { href: "/sourcing/landed-cost", label: "Landed cost" },
];

export function SourcingTabs({ counts }: { counts: { cart: number; rfqs: number; pos: number } }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sourcing" className="-mt-2 mb-6 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const n = t.count ? counts[t.count] : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="module-tab"
          >
            {t.label}
            {n ? <span className="num rounded bg-part-soft px-1.5 text-[11px] font-semibold text-foreground">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
