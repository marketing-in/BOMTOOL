import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { Bell, Search, Radio } from "lucide-react";
import { alertCount } from "@/server/alerts";
import { mockEnabled } from "@/server/sourcing";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { getDisplayCurrency } from "@/lib/prefs";
import { PartMenu, PartTabs } from "@/components/shell/part-nav";
import { CurrencySwitch, ThemeSwitch, UserMenu } from "@/components/shell/topbar-controls";
import { AskPanel } from "@/components/assistant/ask-panel";

/**
 * The frame of every page: one menu line — the logo (home), the three parts of the app (Engineering · Supply · Factory), search and the account —
 * then the current part's pages as tabs, then the page. No sidebar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [currency, alerts] = await Promise.all([getDisplayCurrency(), alertCount()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">Skip to content</a>
      <div className="sticky top-0 z-30 print:hidden">
        <header className="border-b bg-card">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 px-4 sm:px-6 lg:flex-nowrap lg:px-8">
            <Link href="/" aria-label="EMS Sourcing home" className="flex h-14 shrink-0 items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Image src="/brand/thinksemi-logo-dark.svg" alt="ThinkSemi" width={680} height={150} priority unoptimized className="h-6 w-auto dark:hidden" />
              <Image src="/brand/thinksemi-logo-light.svg" alt="ThinkSemi" width={680} height={150} priority unoptimized className="hidden h-6 w-auto dark:block" />
              <span className="hidden border-l pl-3 text-[13px] font-semibold tracking-tight 2xl:inline">EMS Sourcing</span>
            </Link>

            <div className="order-last -mx-4 w-[calc(100%+2rem)] border-t px-1 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-3 lg:order-none lg:mx-0 lg:w-auto lg:border-0 lg:px-0">
              <PartMenu />
            </div>

            <div className="ml-auto flex h-14 items-center gap-2">
              <Form action="/parts" className="relative hidden w-56 xl:block 2xl:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <label htmlFor="global-search" className="sr-only">Search parts</label>
                <input
                  id="global-search"
                  name="q"
                  placeholder="Search parts, manufacturers…"
                  autoComplete="off"
                  className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/30"
                />
              </Form>
              <Link href="/parts" aria-label="Open part search" className="grid size-10 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring xl:hidden">
                <Search className="size-5" aria-hidden />
              </Link>
              <AskPanel />
              <Link
                href="/alerts"
                aria-label={`Alerts${alerts ? `: ${alerts} need attention` : ""}`}
                className="relative grid size-10 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bell className="size-5" />
                {alerts ? <span className="num absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-risk-red px-1 text-[10px] leading-4 text-white">{alerts > 99 ? "99+" : alerts}</span> : null}
              </Link>
              <div className="hidden 2xl:block"><CurrencySwitch value={currency} /></div>
              <ThemeSwitch />
              <UserMenu name={user.name ?? user.email ?? "User"} email={user.email ?? ""} roleLabel={ROLE_LABELS[user.role]} role={user.role} />
            </div>
          </div>
        </header>
        <PartTabs role={user.role} />
      </div>

      <main id="main-content" tabIndex={-1} className="workspace-main mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>

      <footer className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 border-t px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:px-8 print:hidden">
        <span className="inline-flex items-center gap-2">
          <Radio className="size-3.5" aria-hidden />
          {mockEnabled() ? "Simulated supplier data" : "Live supplier data"}
        </span>
        <span className="2xl:hidden"><CurrencySwitch value={currency} /></span>
      </footer>
    </div>
  );
}
