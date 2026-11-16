import Form from "next/form";
import Link from "next/link";
import { Bell, Search, Radio } from "lucide-react";
import { alertCount } from "@/server/alerts";
import { mockEnabled } from "@/server/sourcing";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { Brand } from "@/components/shell/brand";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { BackButton } from "@/components/shell/back-button";
import { CurrencySwitch, MobileNav, UserMenu } from "@/components/shell/topbar-controls";
import { WorkspaceLocation } from "@/components/shell/workspace-location";
import { AskPanel } from "@/components/assistant/ask-panel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [currency, alerts] = await Promise.all([getDisplayCurrency(), alertCount()]);

  return (
    // The rail's navy is painted on the column too, so it runs the full length of a long page (and full-page captures).
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--sidebar)_232px,transparent_232px)] print:block print:bg-none">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand-panel bg-sidebar text-sidebar-foreground lg:flex print:hidden">
        <div className="border-b border-sidebar-border px-6 py-6">
          <Brand onDark />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav role={user.role} />
        </div>
        <div className="flex items-center gap-2 border-t border-sidebar-border px-6 py-4 text-[11px] text-sidebar-foreground/75">
          <Radio className="size-3.5 text-sidebar-primary" aria-hidden />
          {mockEnabled() ? "Simulated supplier data" : "Live supplier data"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b bg-card px-4 py-3 sm:px-6 lg:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <MobileNav role={user.role} />
          <div className="hidden sm:block"><BackButton /></div>
          <Form action="/parts" className="relative min-w-0 max-w-xl flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Search parts</label>
            <input
              id="global-search"
              name="q"
              placeholder="Search parts, manufacturers…"
              autoComplete="off"
              className="h-11 w-full rounded-lg border border-transparent bg-muted/70 pr-3 pl-9 text-sm outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </Form>
          <div className="ml-auto flex items-center gap-2">
            <AskPanel />
            <Link
              href="/alerts"
              aria-label={`Alerts${alerts ? `: ${alerts} need attention` : ""}`}
              className="relative grid size-10 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="size-5" />
              {alerts ? <span className="num absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-risk-red px-1 text-[10px] leading-4 text-white">{alerts > 99 ? "99+" : alerts}</span> : null}
            </Link>
            <div className="hidden md:block"><CurrencySwitch value={currency} /></div>
            <UserMenu name={user.name ?? user.email ?? "User"} email={user.email ?? ""} roleLabel={ROLE_LABELS[user.role]} />
          </div>
          </div>
          <div className="mt-2 flex min-h-6 items-center justify-between gap-3 md:hidden">
            <WorkspaceLocation />
            <CurrencySwitch value={currency} />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-main mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
