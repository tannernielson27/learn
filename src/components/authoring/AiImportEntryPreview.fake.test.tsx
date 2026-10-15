import { cleanup, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderersLoaded } from "@/components/question/testing/renderers";
import { callStructured } from "@/lib/aiImport/claude";
import { extractQuestions, regionsOf } from "@/lib/aiImport/extractQuestions";
import { fakeClaudeClient } from "@/lib/aiImport/fakeClaude";
import { mergeSegments } from "@/lib/aiImport/merge";
import { readSegment, segmentRequest } from "@/lib/aiImport/segment";
import { corpusText } from "@/lib/aiImport/testing/segmentRecordings";
import { AiImportEntryPreview } from "./AiImportEntryPreview";

/**
 * What the e2e run stages (AI_IMPORT_FAKE=1 on a corpus document) must draw without breaking the
 * review page: every staged entry's preview renders, whatever state its item is in.
 */
describe("AiImportEntryPreview on what the fake client stages", () => {
  it("draws every staged entry of a corpus document", async () => {
    const text = corpusText("01-med-surg-review.md");
    const client = fakeClaudeClient();
    const payload = { type: "text" as const, text };
    const chunk = { position: 0, of: 1, pageFrom: null, pageTo: null };
    const segmented = await callStructured(client, segmentRequest(payload, "md", chunk));
    const questions = mergeSegments([readSegment(segmented.value, chunk, payload)]).questions;
    const staged = await extractQuestions(
      (request) => callStructured(client, request),
      questions,
      { payload, kind: "md", sourceText: text },
      regionsOf(questions, text),
    );
    expect(staged.length).toBeGreaterThanOrEqual(4);
    for (const entry of staged) {
      render(<AiImportEntryPreview kind={entry.kind} item={entry.item} label="Question" />);
      await renderersLoaded();
      cleanup();
    }
  });
});
