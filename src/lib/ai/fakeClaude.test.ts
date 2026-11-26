import { describe, expect, it } from "vitest";
import { fromDraft, itemDraftSchema } from "@/lib/ngn/draft";
import { itemSchema } from "@/lib/ngn/schemas";
import {
  ClaudeCallError,
  callStructured,
  createClaudeClient,
  type StructuredRequest,
} from "./claude";
import { documentTextBlock } from "./document";
import { FAKE_DRAFT_RATIONALE, FAKE_DRAFT_VARIANT, fakeClaudeClient } from "./fakeClaude";

/**
 * #621: the fake client answers drafting requests too, so e2e and previews never call the live
 * model for them either. AI import's requests are tested with import (`aiImport/fakeClaude.test.ts`).
 *
 * A drafting request is told apart by its schema: its one top-level answer property is named for
 * its kind, `draft_rationale` or `draft_variant` (the `kind` its reservation records).
 */

const draftRequest = (kind: "draft_rationale" | "draft_variant"): StructuredRequest => ({
  system: "the drafting rules",
  schema: {
    type: "object",
    properties: { [kind]: { type: "object" } },
    required: [kind],
    additionalProperties: false,
  },
  content: [documentTextBlock("Which action comes first?\nA. Assess\nB. Wait")],
  maxTokens: 2_000,
});

describe("the fake client, for drafting", () => {
  it("answers a rationale request with a fixed rationale and no note", async () => {
    const answer = await callStructured(fakeClaudeClient(), draftRequest("draft_rationale"));
    expect(answer.value).toEqual({ draft_rationale: FAKE_DRAFT_RATIONALE });
    expect(FAKE_DRAFT_RATIONALE.general.trim()).not.toBe("");
    expect(FAKE_DRAFT_RATIONALE.note).toBeNull();
    expect(answer.usage).toMatchObject({ inputTokens: 1000, outputTokens: 200 });
  });

  it("answers a variant request with a fixed draft that becomes a valid, keyed item", async () => {
    const answer = await callStructured(fakeClaudeClient(), draftRequest("draft_variant"));
    expect(answer.value).toEqual({ draft_variant: FAKE_DRAFT_VARIANT });
    // The same path a real variant takes (ADR 0018 rule 9): the loose draft shape, the
    // converters, then the item schema.
    const draft = itemDraftSchema.parse(FAKE_DRAFT_VARIANT.draft);
    const { item, reasons } = fromDraft(draft);
    expect(reasons).toEqual([]);
    expect(itemSchema.safeParse(item).success).toBe(true);
    expect(item.type).toBe("multiple_choice");
  });

  it("answers each request with a copy, so a caller that changes one cannot change the next", async () => {
    const first = await callStructured(fakeClaudeClient(), draftRequest("draft_variant"));
    (first.value as { draft_variant: { note: unknown } }).draft_variant.note = "changed";
    const second = await callStructured(fakeClaudeClient(), draftRequest("draft_variant"));
    expect(second.value).toEqual({ draft_variant: FAKE_DRAFT_VARIANT });
  });

  it("is what createClaudeClient gives for AI_IMPORT_FAKE=1 outside production", async () => {
    const client = createClaudeClient({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "preview" });
    const answer = await callStructured(client, draftRequest("draft_rationale"));
    expect(answer.value).toEqual({ draft_rationale: FAKE_DRAFT_RATIONALE });
  });

  it("still refuses to run on production, for drafting as for import", () => {
    expect(() =>
      createClaudeClient({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "production", ANTHROPIC_API_KEY: "k" }),
    ).toThrow(ClaudeCallError);
    expect(() => createClaudeClient({ AI_IMPORT_FAKE: "1", VERCEL_ENV: "production" })).toThrow(
      /not_configured/,
    );
  });
});
