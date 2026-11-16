import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normaliseMpn } from "@/lib/normalise";
import { TokenBucket } from "@/lib/rate-limit";
import { ARTICLES } from "@/knowledge";
import { DICTIONARY } from "@/knowledge/dictionary";
import { refsOf } from "@/lib/assistant/digest";
import { linkAnswer, marksIn, type RefLinks, type RefLookup } from "@/lib/assistant/refs";
import { AssistantError, type AskResult, type AssistantSources, type Step } from "@/lib/assistant/types";
import { assistantAdapter } from "@/server/assistant";
import { createSources } from "@/server/assistant/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.strictObject({
  question: z.string().trim().min(1).max(2000),
  revisionId: z.string().trim().min(1).max(64).nullish(),
  history: z.array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(12_000) })).max(12).default([]),
});

/** What the panel reads, one JSON object per line. */
export type AssistantEvent = { type: "step"; step: Step } | { type: "answer"; answer: AskResult & { links: RefLinks } } | { type: "error"; message: string };

const PER_MINUTE = 10;
const g = globalThis as unknown as { __emsAskBuckets?: Map<string, TokenBucket> };
function allow(userId: string): number {
  g.__emsAskBuckets ??= new Map();
  let b = g.__emsAskBuckets.get(userId);
  if (!b) g.__emsAskBuckets.set(userId, (b = new TokenBucket(PER_MINUTE)));
  return b.take();
}

const ARTICLE_TITLES = new Map(ARTICLES.map((a) => [a.slug, a.title]));
const DICT_NAMES = new Map(DICTIONARY.map((e) => [e.slug, e.name]));

/** Turns the marks in an answer into links to lines, parts and knowledge pages that really exist. */
async function links(text: string, revisionId: string | null, sources: AssistantSources): Promise<RefLinks> {
  const marks = marksIn(text);
  if (!marks.length) return {};
  const build = revisionId ? await sources.build(revisionId).catch(() => null) : null;
  const lines = build?.lines.map((l) => ({ id: l.id, lineNo: l.lineNo, refs: refsOf(l.refDes), partId: l.partId, mpn: l.mpn })) ?? [];
  const onBom = new Set(lines.filter((l) => l.partId && l.mpn).map((l) => normaliseMpn(l.mpn!)));
  const wanted = [...new Set(marks.filter((m) => m.kind === "part").map((m) => normaliseMpn(m.value)))].filter((k) => k && !onBom.has(k));
  const found = wanted.length ? await db.part.findMany({ where: { mpnNormalised: { in: wanted } }, select: { id: true, mpnNormalised: true } }).catch(() => []) : [];
  const lookup: RefLookup = { revisionId: build ? revisionId : null, lines, parts: Object.fromEntries(found.map((p) => [p.mpnNormalised, p.id])), articles: new Set(ARTICLE_TITLES.keys()), articleTitles: ARTICLE_TITLES, dictionary: DICT_NAMES };
  return linkAnswer(text, lookup);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to ask." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a question (up to 2,000 characters)." }, { status: 400 });
  const wait = allow(user.id);
  if (wait > 0) return NextResponse.json({ error: `That is a lot of questions. Try again in ${Math.ceil(wait / 1000)} s.` }, { status: 429 });

  const { question, history } = parsed.data;
  const rev = parsed.data.revisionId ? await db.bomRevision.findUnique({ where: { id: parsed.data.revisionId }, select: { id: true, revision: true, bom: { select: { name: true } } } }) : null;
  const revisionId = rev?.id ?? null;
  const sources = createSources();
  const adapter = assistantAdapter();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: AssistantEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false; // the panel was closed
        }
      };
      try {
        const answer = await adapter.ask({ question, history, revisionId, bomTitle: rev ? `${rev.bom.name} rev ${rev.revision}` : null }, { sources, revisionId }, (step) => send({ type: "step", step }), req.signal);
        send({ type: "answer", answer: { ...answer, links: await links(answer.text, revisionId, sources) } });
      } catch (e) {
        if (!(e instanceof AssistantError)) console.error("[assistant]", e instanceof Error ? e.message : e);
        send({ type: "error", message: e instanceof AssistantError ? e.message : "The assistant failed unexpectedly. Try again." });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

/** Which assistant answers here — the panel says so before the first question. Never returns the key. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to ask." }, { status: 401 });
  return NextResponse.json({ mode: assistantAdapter().key === "anthropic" ? "claude" : "mock" }, { headers: { "Cache-Control": "no-store" } });
}
