import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "./claude";

/**
 * A stand-in for Claude (#342), for e2e runs and local work without a key: `AI_IMPORT_FAKE=1`,
 * refused on a production deployment (`createClaudeClient`). It makes no network call and reads
 * nothing but the request.
 *
 * For a segment request it reports each numbered heading ("## 3." or "## Question 3") of a text
 * chunk as a multiple choice question whose excerpt is the first line after the heading, so an
 * end-to-end run finds the questions a fixture document has. A PDF chunk has none.
 */

const HEADING = /^#{1,6}[ \t]+(?:question[ \t]+)?(\d+)\.?[ \t]*$/gim;

/** The fixed usage each fake call reports, so the ledger moves in e2e as it would for real. */
export const FAKE_USAGE = { input_tokens: 1_000, output_tokens: 200 } as const;

function documentText(body: Anthropic.MessageCreateParamsNonStreaming): string {
  const content = body.messages[0]?.content;
  if (!Array.isArray(content)) return "";
  const text = content
    .filter((block): block is Anthropic.TextBlockParam => block.type === "text")
    .map((block) => block.text)
    .find((value) => value.startsWith("<document>"));
  return text?.replace(/^<document>\n?/, "").replace(/\n?<\/document>$/, "") ?? "";
}

function fakeSegment(text: string) {
  const questions = [...text.matchAll(HEADING)].map((match) => {
    const after = text.slice((match.index ?? 0) + match[0].length);
    const excerpt = after.split("\n").find((line) => line.trim() !== "") ?? "";
    return {
      excerpt: excerpt.trim(),
      number: match[1],
      type: "multiple_choice",
      confidence: 0.5,
      instructorNote: false,
      reliesOnImage: false,
      cutOff: false,
      continued: false,
    };
  });
  return { questions: questions.filter((question) => question.excerpt !== ""), answers: [] };
}

function message(json: unknown): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "fake",
    content: [{ type: "text", text: JSON.stringify(json), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      ...FAKE_USAGE,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

export function fakeClaudeClient(): MessagesClient {
  return {
    messages: {
      async create(body) {
        return message(fakeSegment(documentText(body)));
      },
    },
  };
}
