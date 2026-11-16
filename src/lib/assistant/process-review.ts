import { z } from "zod";
import type { BuildNeeds } from "@/lib/ops/machines";
import type { ProcessCheck } from "@/lib/ops/process-check";
import type { RouteStep } from "@/lib/ops/route";

/**
 * "Review the process with AI" (Phase 23): the product's route, what the board needs, our lines and machines and the
 * rule-based process check go to the AI, which records its review through one strict tool. Without a key the
 * simulated review is built from the process check alone. Pure: the call itself lives in src/server/assistant.
 */

export const ReviewResult = z.object({
  verdict: z.enum(["ready", "ready_with_changes", "not_ready"]),
  summary: z.string().max(800),
  findings: z
    .array(
      z.object({
        step: z.string().max(80),
        level: z.enum(["red", "amber", "info"]),
        issue: z.string().max(500),
        fix: z.string().max(500),
      }),
    )
    .max(20),
  masking: z.string().max(600),
  test: z.string().max(600),
  dispatch: z.string().max(600),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

const str = (description: string) => ({ type: "string", description });

/** Strict: every property required, no extra keys, no numeric bounds (the zod check above enforces lengths). */
export const REVIEW_TOOL = {
  name: "record_process_review",
  description: "Record the review of this product's manufacturing process on our plant. Call it once, with every field.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ready", "ready_with_changes", "not_ready"], description: "ready: build as planned · ready_with_changes: buildable once the findings are handled · not_ready: a step cannot be done on our plant" },
      summary: str("Two or three sentences: can our plant build it, and the one thing that matters most."),
      findings: {
        type: "array",
        description: "One entry per problem or improvement, most serious first. Empty when there is nothing to say.",
        items: {
          type: "object",
          properties: {
            step: str("The route step title it concerns, or 'Whole process'."),
            level: { type: "string", enum: ["red", "amber", "info"], description: "red: blocks the build · amber: risk or extra work · info: improvement" },
            issue: str("What is wrong or missing, in this product's terms."),
            fix: str("What to do about it on our plant."),
          },
          required: ["step", "level", "issue", "fix"],
          additionalProperties: false,
        },
      },
      masking: str("Masking and non-masking: what is masked for the wave and for coating and why, or why no mask is needed."),
      test: str("Test coverage: electrical test, programming, functional and system test, X-ray for hidden joints — enough or not."),
      dispatch: str("Final inspection, packing (ESD, moisture) and dispatch documents."),
    },
    required: ["verdict", "summary", "findings", "masking", "test", "dispatch"],
    additionalProperties: false,
  },
} as const;

export const REVIEW_SYSTEM = `You are the senior process engineer of an EMS factory (PCB → PCBA → box build) reviewing the manufacturing process planned for one product before it is quoted and built.

You get: the product's route step by step (with why each step is there, the parts it handles, any masking decision and the line it runs on), what the board needs (size, SMT placements and sides, finest pitch, hidden joints, through-hole, press-fit, coating), our lines with their machines, and the result of the rule-based check (which machine or bench does each step, and order problems).

Review it as you would on the shop floor:
- Can every step be done on our machines? Use only the machines listed — never assume equipment we do not have. Say when a step falls back to hand work and what that costs in risk.
- Is the order right? Test before coating, clean before coating, mask before and de-mask after, programming before functional test, X-ray after reflow, final inspection before packing, packing before dispatch.
- Masking and non-masking: for the wave (press-fit and open holes) and for conformal coating (connectors, terminals, relays, switches, sensors, RF parts, test points). Say what must be masked, or why no masking is needed.
- Test coverage: electrical test (ICT or flying probe), programming, functional test, X-ray for BGA/QFN joints, burn-in for production.
- Final inspection, ESD and moisture-safe packing, and the documents that go with dispatch (packing list, CoC, test summary).

Be specific to this product: name designators and steps. Be brief — engineers read it. Record the review with record_process_review; do not answer in prose.`;

export type ReviewInput = {
  product: string;
  route: Pick<RouteStep, "key" | "title" | "stage" | "why" | "refs" | "masking" | "where">[];
  needs: BuildNeeds;
  check: ProcessCheck;
  lines: { code: string; name: string; type: string; machines: string[] }[];
};

/** The user turn: everything the review needs, as compact JSON. */
export function reviewPrompt(input: ReviewInput): string {
  const route = input.route.map((s, i) => ({
    n: i + 1,
    step: s.title,
    stage: s.stage,
    why: s.why,
    parts: s.refs.length ? s.refs.slice(0, 12) : undefined,
    masking: s.masking ?? undefined,
    line: s.where ? `${s.where.line}${s.where.equipment ? ` · ${s.where.equipment}` : ""}` : undefined,
  }));
  const check = { overall: input.check.level, summary: input.check.summary, steps: input.check.steps.map((s) => ({ step: s.title, level: s.level, how: s.how, note: s.note })), order: input.check.order };
  return `Product: ${input.product}

Route:
${JSON.stringify(route)}

What the board needs:
${JSON.stringify(input.needs)}

Our lines and machines:
${JSON.stringify(input.lines)}

Rule-based check:
${JSON.stringify(check)}

Review this process and record it with record_process_review.`;
}

/** The simulated review: the rule-based check put in the review's words. */
export function mockReview(input: ReviewInput): ReviewResult {
  const { check, route } = input;
  const findings: ReviewResult["findings"] = [
    ...check.order.map((o) => ({ step: "Whole process", level: o.level === "green" ? ("info" as const) : o.level, issue: o.text, fix: o.level === "red" ? "Change the route order before the build." : "Check it with the line lead." })),
    ...check.steps
      .filter((s) => s.level !== "green")
      .map((s) => ({
        step: s.title,
        level: s.level === "red" ? ("red" as const) : ("amber" as const),
        issue: s.note,
        fix: s.level === "red" ? "Add the machine to a line, or have the step done by a partner." : s.how === "machine" ? "Plan the extra time on the other machine." : "Plan the hand work and its inspection.",
      })),
  ].slice(0, 20);
  const maskSteps = route.filter((s) => /^mask-/.test(s.key));
  const decisions = route.filter((s) => s.masking && !/^(mask|demask)-/.test(s.key)).map((s) => `${s.title}: ${s.masking!.what}`);
  const tests = route.filter((s) => s.stage === "test" || s.key === "system-test" || s.key.startsWith("xray")).map((s) => s.title);
  const verdict: ReviewResult["verdict"] = check.level === "red" ? "not_ready" : findings.length ? "ready_with_changes" : "ready";
  return {
    verdict,
    summary: check.summary,
    findings,
    masking: maskSteps.length
      ? `${maskSteps.map((s) => `${s.title} — ${s.masking?.what ?? s.refs.join(", ")}`).join("; ")}. ${decisions.join("; ")}.`
      : decisions.length
        ? `${decisions.join("; ")}.`
        : "No wave soldering or coating on this product, so nothing is masked.",
    test: tests.length ? `Planned: ${tests.join(", ")}.${input.needs.smt.hidden && !tests.some((t) => /X-ray/i.test(t)) ? ` ${input.needs.smt.hidden} parts have hidden joints and no X-ray step.` : ""}` : "No test steps planned.",
    dispatch: ["inspect", "pack", "dispatch"].every((k) => route.some((s) => s.key === k))
      ? "Final inspection, packing and dispatch are all in the route; dispatch carries the packing list, CoC and test summary."
      : "Final inspection, packing or dispatch is missing from the route.",
  };
}
