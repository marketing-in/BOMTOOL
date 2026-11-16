import "server-only";
import { mockAdapter } from "@/lib/assistant/mock";
import type { AssistantAdapter } from "@/lib/assistant/types";
import { anthropicAdapter } from "./anthropic";

/**
 * ASSISTANT_MOCK=auto (default): the simulated assistant answers only while ANTHROPIC_API_KEY is empty.
 * "true" forces it on (demo, tests), "false" forces it off — then a missing key is an error, not a fallback.
 */
export function assistantAdapter(): AssistantAdapter {
  const v = (process.env.ASSISTANT_MOCK ?? "auto").toLowerCase();
  if (v === "true") return mockAdapter;
  if (v === "false") return anthropicAdapter;
  return anthropicAdapter.configured() ? anthropicAdapter : mockAdapter;
}

export const assistantMode = (): "claude" | "mock" => (assistantAdapter().key === "anthropic" ? "claude" : "mock");
