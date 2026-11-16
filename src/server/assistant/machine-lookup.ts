import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { LOOKUP_SYSTEM, LookupResult, RECORD_TOOL, lookupPrompt, typicalLookup, type LookupInput } from "@/lib/assistant/machine-lookup";
import { AssistantError } from "@/lib/assistant/types";
import { assistantAdapter } from "./index";
import { FALLBACK_BETA, client, explain, model } from "./anthropic";

const MAX_ROUNDS = 6;
/** Web search is on unless ASSISTANT_WEB_SEARCH=off (an organisation can disable it in the AI provider's console). */
const webSearch = () => (process.env.ASSISTANT_WEB_SEARCH ?? "on").toLowerCase() !== "off";

export type LookupOutcome = { result: LookupResult; mode: "claude" | "mock"; model: string | null };

/**
 * Looks a machine's limits up. the AI searches the web for the datasheet and records what it finds through the strict
 * `record_machine_capability` tool; without a key (or with ASSISTANT_MOCK=true) the typical class limits come back.
 * Only the machine's kind, make and model leave the server.
 */
export async function lookupMachine(input: LookupInput, signal?: AbortSignal): Promise<LookupOutcome> {
  if (assistantAdapter().key !== "anthropic") return { result: typicalLookup(input), mode: "mock", model: null };

  const anthropic = client();
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(webSearch() ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 4 }] : []),
    { name: RECORD_TOOL.name, description: RECORD_TOOL.description, strict: true, input_schema: RECORD_TOOL.input_schema as unknown as Anthropic.Beta.BetaTool.InputSchema },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: lookupPrompt(input) }];

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await anthropic.beta.messages.create(
        {
          model: model(),
          max_tokens: 8000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [{ type: "text", text: LOOKUP_SYSTEM, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        },
        { signal },
      );
      if (res.stop_reason === "refusal") throw new AssistantError("The AI declined to look this machine up.", 422);
      // Searches still running on the provider's side: send the turn back and it carries on.
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === RECORD_TOOL.name);
      if (call && res.stop_reason !== "max_tokens") {
        const parsed = LookupResult.safeParse(call.input);
        if (parsed.success) return { result: parsed.data, mode: "claude", model: model() };
        // Out-of-range numbers (strict mode cannot bound them): say so once and let the AI correct them.
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Some values are out of range or malformed: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Record again with those fixed or null.` }] });
        continue;
      }
      if (res.stop_reason === "end_turn") {
        // Answered in words instead of recording: ask for the record.
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: "Record what you found with record_machine_capability (null for anything not found)." });
        continue;
      }
      throw new AssistantError("The AI answer was cut short. Try again.", 502);
    }
    throw new AssistantError("The AI could not settle this machine's limits. Type them in from the datasheet.", 502);
  } catch (e) {
    throw explain(e);
  }
}
