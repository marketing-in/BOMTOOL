# Phase 17 — Ask Claude: answers grounded in the platform's own data

## The request

"Using the Claude API to access the knowledge or everything added [in] this process, to analyse the board and
pin, everything to use this API also."

Read as: put Claude (Anthropic API) inside the platform so anyone can ask a question in plain words and get an
answer built from what the platform already holds — the knowledge base, a BoM with its lines, sources and risk,
and the board with its parts and their pins — from every page.

"Pin" has two meanings in this code and the assistant covers both:

- **Component pins** — pin count, pitch, mount, solder joints and the finest pitch of each placed part
  (`BodySpec.pins/pitch`, `countJoints`). The platform holds no netlist, so there is no per-pin signal name;
  the assistant is told to say so rather than invent a pinout.
- **Pinned sources** — the source a buyer chose by hand for a line in Build & quote (`LinePin`).

## What exists (commit 0fa155c)

- Knowledge: `src/knowledge/*` articles (synced to `KnowledgeArticle`, full-text `searchKnowledge`), the
  dictionary (`searchDictionary`, `dictEntry`), application circuits.
- BoM: `getBuild` (lines, cost, plan, pin, risk, stock tiers, quotes, lead), `getDeepAnalysis` (verdict, actions,
  top risks, Pareto), `scripts/analyse.ts` `partReport` (one part: availability by tier, risk, alternates).
- Board: `getBuild().viewer` (placements, body, package), `.assembly` + `countJoints` (joints, pitch, package
  table), `.board.facts`, `getReverse` (blocks, rails, findings).
- Adapter pattern: `src/server/sourcing` — interface, real adapters gated on env vars, a mock that needs no key.
- No AI code and no Anthropic dependency anywhere.

## What this phase adds

1. **An assistant adapter** (`AssistantAdapter`): a real one on the official `@anthropic-ai/sdk`, and a **mock**
   that works with no key. `ASSISTANT_MOCK=auto` (default) uses the mock only while `ANTHROPIC_API_KEY` is empty —
   the same rule as `SOURCING_MOCK`. Mock answers are labelled "Simulated answer" in the UI.
2. **Nine read-only tools** Claude calls to fetch what it needs (nothing is pasted wholesale, every result is
   capped): `search_knowledge`, `read_knowledge`, `find_boms`, `get_bom_overview`, `list_bom_lines`, `get_line`,
   `get_board`, `get_board_parts`, `get_part`. No tool writes, calls a distributor, or changes a pin.
3. **An "Ask Claude" panel** opened from the top bar on every page. On a BoM page (`/boms/[id]/…`, any of its
   views — BoM, board, 3D, reverse engineering, build) it knows which BoM is open. Suggested questions, progress
   lines while tools run ("Reading the board…"), a clear error state, and answers whose references are links:
   BoM lines, designators on the board, parts, knowledge articles.
4. `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ASSISTANT_MOCK` in `.env.example`. The key is read on the server only.

## Design

- `src/lib/assistant/` — pure, Vitest:
  - `types.ts` — `AssistantAdapter`, `AssistantSources` (the data the tools read, injected so tests use fakes),
    `AskInput`, `AskResult`, `Step`.
  - `digest.ts` — shrink `Build` / deep report / reverse report / articles into the compact JSON a tool returns.
  - `tools.ts` — tool names, descriptions, JSON Schemas, input checks, `runTool(name, input, ctx)`.
  - `refs.ts` — the reference marks Claude writes (`[[line:12]]`, `[[ref:U3]]`, `[[part:LM358DR]]`,
    `[[kb:reflow-soldering]]`, `[[dict:ldo]]`) → links; unknown marks fall back to plain text.
  - `mock.ts` — deterministic adapter: chooses tools from the words of the question, runs the same `runTool`,
    writes the answer from the results. Exercises the whole path without a key.
  - `prompt.ts` — the system prompt (frozen text, so it caches).
- `src/server/assistant/` — server-only:
  - `sources.ts` — `AssistantSources` over `getBuild`, `getDeepAnalysis`, `getReverse`, `searchKnowledge`, the
    dictionary and `partReport`.
  - `anthropic.ts` — the real adapter: manual tool loop on `client.beta.messages.create`, model
    `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), adaptive thinking (the default), effort `medium`,
    `max_tokens` 16000, at most 8 tool rounds, parallel tool calls answered in one message, prompt caching on
    the system prompt + tool list, server-side refusal fallback (`fallbacks: "default"`), `refusal` and
    `max_tokens` stop reasons handled, typed SDK errors mapped to plain messages.
  - `index.ts` — `assistantAdapter()`, `assistantMode()`.
- `src/server/part-report.ts` — `partReport` moved out of `scripts/analyse.ts` so the script and the tool share it.
- `src/app/api/assistant/route.ts` — `POST`, signed-in users only (401 otherwise), per-user rate limit
  (10 questions a minute), input checked with zod, answer streamed as NDJSON events (`step`, `answer`, `error`).
- `src/components/assistant/ask-panel.tsx` (client) + a button in `src/app/(app)/layout.tsx`.

## What is sent to Anthropic

The question, the last few turns of the same panel session, and the tool results Claude asks for: part numbers,
quantities, stock, prices, risk, board geometry, knowledge text. **Not sent:** the API key (header only, server
side), user names, e-mails or roles, the customer's name, supplier contact details. Nothing is stored; the
conversation lives in the open panel and is gone on reload.

## New dependency

`@anthropic-ai/sdk` (official SDK) — the only addition. No schema change.

## Out of scope (say so in the UI where it matters)

Per-pin signal names / netlists (not in the platform), image or Gerber upload to Claude, writing actions
(choosing a source, raising an RFQ) from the chat, saved conversations.

## Verify

Vitest: digests, tool handlers against fake sources, reference parsing, the mock adapter end to end. In the
running app (`ems-dev-check`) on a seeded BoM with the mock: a BoM question, a board/pins question, a pinned-
source question, a knowledge question from a non-BoM page, the error state, dark and light, tablet width. With
the real key only if `ANTHROPIC_API_KEY` is in `.env`.
