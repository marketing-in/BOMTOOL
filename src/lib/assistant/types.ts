import type { Article } from "@/knowledge/types";
import type { Build } from "@/server/build";
import type { DeepReport } from "@/lib/bom/deep-analysis";
import type { ReverseReport } from "@/lib/reverse";
import type { PartReport } from "@/server/part-report";
import type { PlantCheck } from "@/lib/ops/machines";

/**
 * Ask AI (Phase 17). The assistant answers from the platform's own data, which it reads through the tools
 * in ./tools.ts. Everything in this folder is pure; the database and the AI SDK live in src/server/assistant.
 */

export const TOOL_NAMES = ["search_knowledge", "read_knowledge", "find_boms", "get_bom_overview", "list_bom_lines", "get_line", "get_board", "get_board_parts", "get_part", "get_line_fit"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** One tool call, as shown to the user while the answer is being worked out. */
export type Step = { tool: ToolName; label: string };

export type Turn = { role: "user" | "assistant"; text: string };

export type AskInput = {
  question: string;
  /** Earlier turns of the open panel, oldest first. */
  history: Turn[];
  /** The BoM revision the user has open, if any. */
  revisionId: string | null;
  bomTitle: string | null;
};

export type AskResult = {
  /** The answer, with reference marks (see ./refs.ts). */
  text: string;
  mode: "claude" | "mock";
  model: string | null;
  steps: Step[];
  /** Set when the answer was cut short. */
  stopped?: "refusal" | "max_tokens" | "rounds";
};

/** The parts of a Build the tools read. `Build` satisfies it; tests pass a small fake. */
export type BuildLike = Pick<Build, "revisionId" | "title" | "refQty" | "quantities" | "lines" | "sourcing" | "quotes" | "leadDays" | "leadDriver" | "warnings"> & {
  product: { name: string; partNumber: string | null; revision: string } | null;
  board: Pick<Build["board"], "facts" | "areaCm2" | "technology" | "chosenName" | "leadDays">;
  viewer: Pick<Build["viewer"], "parts" | "approximateLayout" | "route" | "enclosure"> & { board: Pick<Build["viewer"]["board"], "source" | "fab"> };
  assembly: Build["assembly"];
};

export type BomHit = { revisionId: string; name: string; revision: string; project: string | null; lines: number };

export type ArticleHit = { slug: string; domain: string; title: string; summary: string };

/** Where the tools get their data. The server implementation reads the database; tests inject fakes. */
export interface AssistantSources {
  searchArticles(query: string, limit: number): Promise<ArticleHit[]>;
  article(slug: string): Promise<Article | null>;
  findBoms(query: string, limit: number): Promise<BomHit[]>;
  build(revisionId: string): Promise<BuildLike | null>;
  deep(revisionId: string): Promise<DeepReport | null>;
  reverse(revisionId: string): Promise<ReverseReport | null>;
  part(mpn: string): Promise<PartReport | null>;
  /** Our lines with their machines and limits (src/server/lines.ts). */
  lines(): Promise<unknown[]>;
  /** Can our machines build this revision, line by line and step by step. */
  lineFit(revisionId: string): Promise<PlantCheck | null>;
}

export type ToolContext = { sources: AssistantSources; revisionId: string | null };

export interface AssistantAdapter {
  key: "anthropic" | "mock";
  label: string;
  /** Env vars that must be set for the adapter to run. */
  envVars: string[];
  configured(): boolean;
  ask(input: AskInput, ctx: ToolContext, onStep?: (step: Step) => void, signal?: AbortSignal): Promise<AskResult>;
}

/** A failure the user can act on; the message is shown as it is. */
export class AssistantError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
