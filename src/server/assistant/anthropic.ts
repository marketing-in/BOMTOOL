import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, userTurn } from "@/lib/assistant/prompt";
import { TOOLS, runStep } from "@/lib/assistant/tools";
import { AssistantError, type AskInput, type AskResult, type AssistantAdapter, type Step, type ToolContext } from "@/lib/assistant/types";



/** claude-opus-5-5 unless ANTHROPIC_MODEL names another model. */
export const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 8;
const MAX_TOKENS = 16_000;
/** Lets a policy decline be re-run on a fallback model inside the same call instead of ending the answer. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const model = () => process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

const g = globalThis as unknown as { __emsAnthropic?: { id: string; client: Anthropic } };
export function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!key) throw new AssistantError("ANTHROPIC_API_KEY is not set.", 503);
  // A key made at organisation level (not inside a workspace) must name the workspace on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim() ?? "";
  const id = `${key}|${workspace}`;
  if (g.__emsAnthropic?.id !== id) {
    g.__emsAnthropic = { id, client: new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000, ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}) }) };
  }
  return g.__emsAnthropic.client;
}

/** The API's own message from an error body, without the JSON around it. */
const apiMessage = (e: InstanceType<typeof Anthropic.APIError>) => ((e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message).slice(0, 240);

// Frozen prefix (tools, then system): one cache breakpoint on the system block covers both.
const SYSTEM: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
const TOOL_PARAMS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

type ApiErrorLike = InstanceType<typeof Anthropic.APIError>;

/**
 * The SDK's error, recognised by shape as well as by class: Next.js can bundle the SDK twice (a route handler and a
 * server action each get a copy), and then `instanceof` fails for an error thrown by the other copy.
 */
const SDK_ERRORS = new Set(["APIError", "BadRequestError", "AuthenticationError", "PermissionDeniedError", "NotFoundError", "ConflictError", "UnprocessableEntityError", "RateLimitError", "InternalServerError", "APIConnectionError", "APIConnectionTimeoutError", "APIUserAbortError"]);
const sdkName = (e: unknown) => (e instanceof Error && SDK_ERRORS.has(e.constructor.name) ? e.constructor.name : null);
const asApiError = (e: unknown): ApiErrorLike | null => (e instanceof Anthropic.APIError || (sdkName(e) && typeof (e as { status?: unknown }).status === "number") ? (e as ApiErrorLike) : null);

/** An SDK failure in words the person at the tablet can act on. Never includes the key or the request. */
export function explain(e: unknown): AssistantError {
  if (e instanceof AssistantError) return e;
  if (e instanceof Anthropic.APIUserAbortError || sdkName(e) === "APIUserAbortError") return new AssistantError("Stopped.", 499);
  if (e instanceof Anthropic.APIConnectionError || sdkName(e)?.startsWith("APIConnection")) return new AssistantError("Could not reach the AI service. Check the internet connection and try again.", 502);
  const api = asApiError(e);
  if (api) return explainStatus(api);
  // Not an API error: a bug or a loader failing. Log what it was (never the request) so it can be found.
  console.error("[assistant] unexpected", e instanceof Error ? `${e.constructor.name}: ${e.message.slice(0, 300)}` : String(e).slice(0, 300));
  return new AssistantError("The assistant failed unexpectedly. Try again.", 500);
}

function explainStatus(e: ApiErrorLike): AssistantError {
  if (e.status === 401) return new AssistantError("The AI service rejected the API key. Check ANTHROPIC_API_KEY in .env and restart the app.", 502);
  if (e.status === 403) return new AssistantError(`This API key may not use ${model()}. Set ANTHROPIC_MODEL in .env to a model the key can use.`, 502);
  if (e.status === 404) return new AssistantError(`The AI service does not know the model "${model()}". Check ANTHROPIC_MODEL in .env.`, 502);
  if (e.status === 429) return new AssistantError("The AI is busy (rate limit reached). Try again in a minute.", 429);
  if (e.status === 400) {
    const msg = apiMessage(e);
    // An organisation-level key with no workspace named: the one setting the user has to add.
    if (/anthropic-workspace-id/i.test(msg)) {
      return new AssistantError(
        process.env.ANTHROPIC_WORKSPACE_ID?.trim()
          ? "The AI service did not accept ANTHROPIC_WORKSPACE_ID. Check the ID (Console → Settings → Workspaces) and restart the app."
          : "This API key is not tied to a workspace. Add ANTHROPIC_WORKSPACE_ID (Console → Settings → Workspaces, the ID starts with wrkspc_) to .env and restart the app — or create the key inside a workspace.",
        502,
      );
    }
    return new AssistantError(`The AI service did not accept the request: ${msg}`, 502);
  }
  return new AssistantError(`The AI service returned an error (${e.status ?? "no status"}). Try again shortly.`, 502);
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) => content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("").trim();

export const anthropicAdapter: AssistantAdapter = {
  key: "anthropic",
  label: "AI (live)",
  envVars: ["ANTHROPIC_API_KEY"],
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()),

  async ask(input: AskInput, ctx: ToolContext, onStep?: (s: Step) => void, signal?: AbortSignal): Promise<AskResult> {
    const anthropic = client();
    const steps: Step[] = [];
    const note = (s: Step) => {
      steps.push(s);
      onStep?.(s);
    };
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...input.history.map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.role, content: t.text })),
      { role: "user", content: userTurn(input) },
    ];
    const done = (text: string, stopped?: AskResult["stopped"]): AskResult => ({ text, mode: "claude", model: model(), steps, ...(stopped ? { stopped } : {}) });

    try {
      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const res = await anthropic.beta.messages.create(
          {
            model: model(),
            max_tokens: MAX_TOKENS,
            betas: [FALLBACK_BETA],
            fallbacks: "default",
            // Thinking is adaptive (always on for this model); effort sets how deep it goes.
            output_config: { effort: "medium" },
            system: SYSTEM,
            tools: TOOL_PARAMS,
            messages,
          },
          { signal },
        );

        if (res.stop_reason === "refusal") return done(textOf(res.content) || "The AI declined to answer this question.", "refusal");
        if (res.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: res.content });
          continue;
        }
        const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
        // A reply cut off at max_tokens can end inside a tool call; never run that.
        if (res.stop_reason === "max_tokens") return done(textOf(res.content) || "The answer ran too long. Ask a narrower question.", "max_tokens");
        if (res.stop_reason !== "tool_use" || !calls.length) return done(textOf(res.content) || "The AI returned no answer. Try rephrasing the question.");
        if (round === MAX_ROUNDS) break;

        // Thinking and tool_use blocks go back exactly as they came.
        messages.push({ role: "assistant", content: res.content });
        const results = await Promise.all(
          calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            const r = await runStep(c.name, c.input, ctx, note);
            return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(r.data), ...(r.ok ? {} : { is_error: true }) };
          }),
        );
        // Every result of the round in one user message, so parallel calls stay parallel.
        messages.push({ role: "user", content: results });
      }
      return done("This question needed more look-ups than one answer allows. Ask about one thing at a time.", "rounds");
    } catch (e) {
      throw explain(e);
    }
  },
};
