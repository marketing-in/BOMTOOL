import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_SYSTEM, REVIEW_TOOL, ReviewResult, mockReview, reviewPrompt, type ReviewInput } from "@/lib/assistant/process-review";
import { AssistantError } from "@/lib/assistant/types";
import { assistantAdapter } from "./index";
import { FALLBACK_BETA, client, explain, model } from "./anthropic";

const MAX_ROUNDS = 3;

export type ReviewOutcome = { review: ReviewResult; mode: "claude" | "mock"; model: string | null; /** Why the live review was not used, when it failed. */ note?: string };

/**
 * Has the AI review a product's process on our plant, recorded through the strict `record_process_review` tool.
 * Without a key (or with ASSISTANT_MOCK=true) the simulated review comes back, built from the rule-based check.
 * What leaves the server: the route, the board's needs, our machines and the check — no customer name or prices.
 */
export async function reviewProcess(input: ReviewInput, signal?: AbortSignal): Promise<ReviewOutcome> {
  if (assistantAdapter().key !== "anthropic") return { review: mockReview(input), mode: "mock", model: null };

  const anthropic = client();
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { name: REVIEW_TOOL.name, description: REVIEW_TOOL.description, strict: true, input_schema: REVIEW_TOOL.input_schema as unknown as Anthropic.Beta.BetaTool.InputSchema },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: reviewPrompt(input) }];
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await anthropic.beta.messages.create(
        {
          model: model(),
          max_tokens: 12000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [{ type: "text", text: REVIEW_SYSTEM, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        },
        { signal },
      );
      if (res.stop_reason === "refusal") throw new AssistantError("The AI declined to review this process.", 422);
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === REVIEW_TOOL.name);
      if (call && res.stop_reason !== "max_tokens") {
        const parsed = ReviewResult.safeParse(call.input);
        if (parsed.success) return { review: parsed.data, mode: "claude", model: model() };
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Some fields are too long or malformed: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Record again, shorter.` }] });
        continue;
      }
      if (res.stop_reason === "end_turn" || res.stop_reason === "pause_turn") {
        // Answered in words instead of recording: ask for the record.
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: "Record the review with record_process_review." });
        continue;
      }
      throw new AssistantError("The AI review was cut short. Try again.", 502);
    }
    throw new AssistantError("The AI could not finish the review. Try again.", 502);
  } catch (e) {
    // The live AI could not be reached (key, workspace, network): the rule-based review still answers, and says why.
    const err = explain(e);
    if (err.status === 499) throw err;
    return { review: mockReview(input), mode: "mock", model: null, note: err.message };
  }
}
