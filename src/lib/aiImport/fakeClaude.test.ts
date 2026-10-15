import { describe, expect, it } from "vitest";
import { callStructured } from "./claude";
import { fakeClaudeClient } from "./fakeClaude";
import { readSegment, segmentRequest } from "./segment";

const CHUNK = { position: 0, of: 1, pageFrom: null, pageTo: null };

describe("the fake client", () => {
  it("reports each numbered heading of a text chunk as a question", async () => {
    const text =
      "# Quiz\n\n## 1.\n\nWhich action first?\n\n## Question 2\n\nWhich finding?\n\n## 3.\n";
    const payload = { type: "text" as const, text };
    const answer = await callStructured(fakeClaudeClient(), segmentRequest(payload, "md", CHUNK));
    expect(answer.usage).toMatchObject({ inputTokens: 1000, outputTokens: 200 });
    const segment = readSegment(answer.value, CHUNK, payload);
    expect(segment.questions.map((q) => [q.number, q.excerpt, q.flags.notInSource])).toEqual([
      ["1", "Which action first?", false],
      ["2", "Which finding?", false],
    ]);
  });

  it("finds nothing in a PDF chunk, or in a request with no document", async () => {
    const payload = { type: "pdf" as const, bytes: new Uint8Array([1]) };
    const answer = await callStructured(fakeClaudeClient(), segmentRequest(payload, "pdf", CHUNK));
    expect(answer.value).toEqual({ questions: [], answers: [] });
    const bare = await fakeClaudeClient().messages.create({
      model: "m",
      max_tokens: 1,
      messages: [{ role: "user", content: "hello" }],
    });
    expect(bare.content[0]).toMatchObject({ text: '{"questions":[],"answers":[]}' });
  });
});
