"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { CURRENCY_COOKIE_NAME } from "./constants";
import { OTHER } from "./nav";

export function CurrencySwitch({ value }: { value: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Display currency" className="inline-flex h-9 shrink-0 items-center rounded-lg bg-muted p-0.5">
      {CURRENCIES.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          disabled={pending}
          onClick={() => {
            document.cookie = `${CURRENCY_COOKIE_NAME}=${c}; path=/; max-age=31536000; samesite=lax`;
            start(() => router.refresh());
          }}
          className={
            "num h-8 rounded-[5px] px-2.5 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 " +
            (value === c ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:text-foreground")
          }
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** The account menu also holds the pages outside the four parts: Home, the app tour and (admins) users. */
export function UserMenu({ name, email, roleLabel, role }: { name: string; email: string; roleLabel: string; role: Role }) {
  const others = OTHER.filter((i) => !i.permission || can(role, i.permission));
  const { theme, setTheme } = useTheme();
  const initials = name
    .replace(/\(.*\)/, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2" aria-label="Account menu">
          <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
          <span className="hidden text-left text-xs leading-tight 2xl:block">
            <span className="block font-medium">{name}</span>
            <span className="block text-muted-foreground">{roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {others.map((i) => (
          <DropdownMenuItem key={i.href} asChild>
            <Link href={i.href}>
              <i.icon className="size-4" /> {i.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Light / dark, one tap, always in the top bar. The account menu still offers "follow the system". */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dark = ready && resolvedTheme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light" : "Switch to dark"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border bg-muted outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`absolute left-0.5 grid size-6.5 place-items-center rounded-full bg-card text-foreground shadow-sm transition-transform duration-200 ease-out ${dark ? "translate-x-6" : ""}`}>
        {dark ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
      </span>
    </button>
  );
}
