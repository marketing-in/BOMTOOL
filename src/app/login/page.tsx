import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/auth";
import { Brand } from "@/components/shell/brand";
import { ArrowRight, Boxes, CircuitBoard, Search, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const [session, user] = await Promise.all([getSession(), getCurrentUser()]);
  const { callbackUrl } = await searchParams;
  // Only allow same-site relative redirects.
  const target = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  if (user) redirect(target);
  // A session cookie whose user was deactivated or had their password changed.
  const ended = !!session?.user;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="login-signal flex flex-col justify-between px-7 py-8 sm:px-12 lg:min-h-dvh lg:px-16 lg:py-12" aria-label="About EMS Sourcing">
        <Brand onDark />
        <div className="my-12 hidden max-w-lg lg:my-20 lg:block">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">From customer BoM<br />to factory floor.</h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-sidebar-foreground/80">One workspace to understand every component, source with confidence and keep your next build moving.</p>
          <div className="mt-8 hidden sm:block">
            {[
              { icon: CircuitBoard, title: "Understand the product", text: "BoMs, board files and component intelligence." },
              { icon: Search, title: "Source with the full picture", text: "Own stock first. Compare suppliers and landed cost." },
              { icon: Boxes, title: "Take it to the line", text: "Check readiness, quote and plan the build." },
            ].map(({ icon: Icon, title, text }) => (
              <div className="login-step" key={title}>
                <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                <div className="flex-1"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-sidebar-foreground/75">{text}</p></div>
                <ArrowRight className="size-4 opacity-50" aria-hidden />
              </div>
            ))}
          </div>
        </div>
        <p className="hidden text-xs text-sidebar-foreground/70 lg:block">ThinkSemi · Sourcing, engineering and manufacturing</p>
      </section>
      <section className="flex items-center justify-center bg-card px-6 py-12 sm:px-12 lg:py-20">
        <div className="w-full max-w-[360px]">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in with your factory account to pick up where you left off.</p>
          {ended ? (
            <p role="status" className="mt-5 rounded-lg border border-risk-amber/40 bg-risk-amber-soft p-4 text-sm">
              Your session has ended. Sign in again, or ask an administrator if your account was changed.
            </p>
          ) : null}
          <LoginForm callbackUrl={target} />
          <div className="mt-8 flex items-start gap-2.5 border-t pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Access is managed by your organization. Need an account? Contact your administrator.</p></div>
        </div>
      </section>
    </main>
  );
}
