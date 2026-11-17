"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, Check, Loader2, RotateCcw, Sparkles, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { plainRef, refKey, toBlocks, type Inline, type RefLinks } from "@/lib/assistant/refs";
import type { AskResult, Step } from "@/lib/assistant/types";

type Event = { type: "step"; step: Step } | { type: "answer"; answer: AskResult & { links: RefLinks } } | { type: "error"; message: string };

type Turn = { role: "user"; text: string } | ({ role: "assistant" } & AskResult & { links: RefLinks });

const ON_BOM = ["What is blocking this BoM?", "Can our machines build this board, and on which line?", "Which parts have the most pins, and what is the finest pitch?", "Which lines have a source chosen by hand?"];
const ANYWHERE = ["What machines are on our lines?", "How do I choose between ENIG and HASL?", "What should I check before baking moisture-sensitive parts?"];

const STOPPED: Record<NonNullable<AskResult["stopped"]>, string> = {
  refusal: "The AI declined to answer this one.",
  max_tokens: "The answer was cut short — ask a narrower question for the rest.",
  rounds: "Stopped after several look-ups — ask about one thing at a time.",
};

/** The BoM revision on screen: every page under /boms/<id> belongs to one. */
function openRevision(pathname: string): string | null {
  const id = /^\/boms\/([^/]+)/.exec(pathname)?.[1];
  return id && id !== "new" ? id : null;
}

function Inlines({ parts, links, onNavigate }: { parts: Inline[]; links: RefLinks; onNavigate: () => void }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === "text") return <Fragment key={i}>{p.text}</Fragment>;
        if (p.t === "bold") return <strong key={i} className="font-semibold text-foreground">{p.text}</strong>;
        if (p.t === "code") return <code key={i} className="num rounded bg-muted px-1 py-0.5 text-[0.85em]">{p.text}</code>;
        const link = links[refKey(p.kind, p.value)];
        if (!link) return <Fragment key={i}>{plainRef(p.kind, p.value)}</Fragment>;
        return (
          <Link
            key={i}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-2 outline-none transition-colors duration-150 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring",
              (p.kind === "part" || p.kind === "ref") && "num",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}

function Answer({ text, links, onNavigate }: { text: string; links: RefLinks; onNavigate: () => void }) {
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
      {toBlocks(text).map((b, i) => {
        if (b.type === "p" && "inline" in b) return <p key={i}><Inlines parts={b.inline} links={links} onNavigate={onNavigate} /></p>;
        if (b.type === "h" && "inline" in b) return <p key={i} className="pt-1 font-semibold text-foreground"><Inlines parts={b.inline} links={links} onNavigate={onNavigate} /></p>;
        if (b.type !== "ul" && b.type !== "ol") return null;
        const List = b.type;
        return (
          <List key={i} className={cn("space-y-1.5 pl-5", b.type === "ul" ? "list-disc marker:text-muted-foreground/60" : "list-decimal marker:text-muted-foreground")}>
            {b.items.map((it, k) => <li key={k} className="pl-0.5"><Inlines parts={it} links={links} onNavigate={onNavigate} /></li>)}
          </List>
        );
      })}
    </div>
  );
}

function Steps({ steps, running }: { steps: Step[]; running: boolean }) {
  if (!steps.length && !running) return null;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {steps.map((s, i) => {
        const live = running && i === steps.length - 1;
        return (
          <li key={i} className="flex items-start gap-2">
            {live ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" aria-hidden /> : <Check className="mt-0.5 size-3.5 shrink-0 text-risk-green" aria-hidden />}
            <span>{s.label}</span>
          </li>
        );
      })}
      {running && !steps.length ? (
        <li className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin text-primary" aria-hidden /> Thinking…</li>
      ) : null}
    </ul>
  );
}

/** Ask AI: a side panel on every page, answering from the knowledge base, the BoM on screen and its board. */
export function AskPanel() {
  const pathname = usePathname();
  const revisionId = openRevision(pathname);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"claude" | "mock" | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || mode) return;
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { mode?: "claude" | "mock" } | null) => j?.mode && setMode(j.mode))
      .catch(() => {});
  }, [open, mode]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, steps, pending, error]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || pending) return;
      const history = turns.slice(-6).map((t) => ({ role: t.role, text: t.text }));
      setTurns((t) => [...t, { role: "user", text: q }]);
      setDraft("");
      setError(null);
      setSteps([]);
      setPending(true);
      const ctl = new AbortController();
      abort.current = ctl;
      try {
        const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, revisionId, history }), signal: ctl.signal });
        if (!res.ok || !res.body) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? (res.status === 401 ? "You are signed out. Sign in and ask again." : "The assistant could not be reached. Try again."));
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let answered = false;
        const take = (line: string) => {
          if (!line.trim()) return;
          const e = JSON.parse(line) as Event;
          if (e.type === "step") setSteps((s) => [...s, e.step]);
          else if (e.type === "answer") {
            answered = true;
            setMode(e.answer.mode);
            setTurns((t) => [...t, { role: "assistant", ...e.answer }]);
          } else throw new Error(e.message);
        };
        for (;;) {
          const { done, value } = await reader.read();
          buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          lines.forEach(take);
          if (done) break;
        }
        take(buf);
        if (!answered) throw new Error("The answer did not arrive. Try again.");
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error && e.message ? e.message : "The assistant could not be reached. Try again.");
      } finally {
        setPending(false);
        setSteps([]);
        abort.current = null;
      }
    },
    [pending, turns, revisionId],
  );

  const stop = () => abort.current?.abort();
  const reset = () => {
    stop();
    setTurns([]);
    setError(null);
    box.current?.focus();
  };
  const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.text;
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10 gap-1.5 px-2.5 sm:px-3" aria-label="Ask AI about this page">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <span className="hidden sm:inline">Ask</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md lg:max-w-lg" onOpenAutoFocus={(e) => { e.preventDefault(); box.current?.focus(); }}>
        <div className="border-b px-5 py-4 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden /> Ask AI
            {mode ? (
              <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", mode === "claude" ? "bg-risk-green-soft text-risk-green" : "bg-risk-amber-soft text-risk-amber")}>
                {mode === "claude" ? "Live" : "Simulated"}
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs">
            {revisionId ? "Answers from the BoM on screen — its lines, sources, board and pins — and the knowledge base." : "Answers from the knowledge base and the parts catalogue. Open a BoM to ask about its lines and board."}
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5" aria-live="polite">
          {mode === "mock" ? (
            <p className="rounded-md border border-risk-amber/30 bg-risk-amber-soft px-3 py-2 text-xs leading-relaxed text-foreground/80">
              No AI key is set, so answers are assembled from the platform&apos;s data alone. Add <code className="num">ANTHROPIC_API_KEY</code> to <code className="num">.env</code> and restart for real answers.
            </p>
          ) : null}

          {!turns.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Try asking</p>
              <ul className="space-y-1.5">
                {(revisionId ? ON_BOM : ANYWHERE).map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => ask(s)} disabled={pending} className="w-full rounded-md border bg-card px-3 py-2.5 text-left text-sm outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="ml-8 rounded-lg rounded-br-sm bg-primary/10 px-3.5 py-2.5 text-sm whitespace-pre-wrap">{t.text}</div>
            ) : (
              <div key={i} className="space-y-2">
                <Answer text={t.text} links={t.links} onNavigate={close} />
                {t.stopped ? <p className="flex items-start gap-1.5 text-xs text-risk-amber"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {STOPPED[t.stopped]}</p> : null}
                {t.steps.length ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer rounded-sm outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      {t.mode === "mock" ? "Simulated answer" : "AI answer"} · read {t.steps.length} {t.steps.length === 1 ? "source" : "sources"}
                    </summary>
                    <div className="mt-2"><Steps steps={t.steps} running={false} /></div>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">{t.mode === "mock" ? "Simulated answer" : "AI answer"} · answered without reading the platform&apos;s data</p>
                )}
              </div>
            ),
          )}

          {pending ? <Steps steps={steps} running /> : null}

          {error ? (
            <div role="alert" className="space-y-2 rounded-md border border-risk-red/30 bg-risk-red-soft px-3 py-2.5 text-sm">
              <p className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-risk-red" aria-hidden /> {error}</p>
              {lastQuestion ? (
                <button type="button" onClick={() => { setTurns((t) => (t[t.length - 1]?.role === "user" ? t.slice(0, -1) : t)); ask(lastQuestion); }} className="rounded-sm text-xs font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Ask again
                </button>
              ) : null}
            </div>
          ) : null}
          <div ref={end} />
        </div>

        <form
          className="border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <label htmlFor="ask-claude" className="sr-only">Your question</label>
          <div className="flex items-end gap-2">
            <textarea
              id="ask-claude"
              ref={box}
              rows={2}
              value={draft}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              placeholder={revisionId ? "Ask about this BoM, its board or a part…" : "Ask about a part, a process or a standard…"}
              className="max-h-40 min-h-[3.25rem] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {pending ? (
              <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={stop} aria-label="Stop">
                <Square className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!draft.trim()} aria-label="Ask">
                <ArrowUp className="size-4" aria-hidden />
              </Button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>Reads only — it cannot change a BoM, a source or an order.</span>
            {turns.length ? (
              <button type="button" onClick={reset} className="inline-flex shrink-0 items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <RotateCcw className="size-3" aria-hidden /> New chat
              </button>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
