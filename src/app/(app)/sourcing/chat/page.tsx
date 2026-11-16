import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listMessages, recentThreads, threadContext } from "@/server/chat";
import { PageHeader, EmptyState } from "@/components/data/page-header";
import { ChatForm } from "@/components/sourcing/chat-form";
import { cn } from "@/lib/utils";

export const metadata = { title: "Seller chat" };

const time = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ thread?: string }> }) {
  const user = await requireUser();
  const { thread } = await searchParams;
  const [ctx, threads] = await Promise.all([thread ? threadContext(thread) : null, recentThreads()]);
  const messages = ctx ? await listMessages(ctx.thread) : [];
  const contexts = await Promise.all(threads.map(async (t) => ({ t, c: await threadContext(t.thread) })));

  return (
    <>
      <PageHeader title="Seller chat" description="Talk to channel partners and excess sellers about a listing or an RFQ — date codes, CoC, counter-offers. Kept here with the deal; nothing is e-mailed." />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label="Conversations" className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-medium">Conversations</div>
          {contexts.length ? (
            <ul className="divide-y">
              {contexts.map(({ t, c }) => (
                <li key={t.thread}>
                  <Link
                    href={`/sourcing/chat?thread=${encodeURIComponent(t.thread)}`}
                    aria-current={t.thread === ctx?.thread ? "page" : undefined}
                    className={cn("block px-4 py-3 text-sm hover:bg-muted/40", t.thread === ctx?.thread && "bg-muted")}
                  >
                    <span className="num block font-medium">{c?.title ?? t.thread}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c?.seller} — {t.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">No conversations yet. Start one from a partner or excess listing on a part page.</p>
          )}
        </nav>

        <section aria-labelledby="thread-title" className="flex min-h-[420px] flex-col rounded-lg border bg-card">
          {ctx ? (
            <>
              <header className="border-b px-4 py-3">
                <h2 id="thread-title" className="text-base font-medium">
                  <Link href={ctx.href} className="num hover:underline">{ctx.title}</Link> · {ctx.seller}
                </h2>
                <p className="text-xs text-muted-foreground">{ctx.detail}</p>
              </header>
              <ol className="flex-1 space-y-3 overflow-y-auto p-4" aria-label="Messages">
                {messages.length ? (
                  messages.map((m) => (
                    <li key={m.id} className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.fromSeller ? "bg-muted" : "ml-auto bg-primary/10")}>
                      <span className="block text-[11px] text-muted-foreground">{m.author} · {time(m.createdAt)}</span>
                      <span className="whitespace-pre-wrap">{m.body}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No messages yet.</li>
                )}
              </ol>
              {can(user.role, "sourcing.buy") ? <ChatForm thread={ctx.thread} seller={ctx.seller} /> : null}
            </>
          ) : (
            <EmptyState title={thread ? "Conversation not found" : "Pick a conversation"}>{thread ? "That listing or RFQ no longer exists." : "Or open one from a listing's chat button."}</EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
