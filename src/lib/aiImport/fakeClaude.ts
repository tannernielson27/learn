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

const OPTION = /^\s*(?:[-*]\s+)?[A-Za-z][.)]\s+(.+)$/;

/** The options listed under a question's opening line, as `A. text` lines. */
function optionsAfter(text: string, opening: string): { text: string }[] {
  const at = text.indexOf(opening);
  if (at < 0) return [];
  const options: { text: string }[] = [];
  for (const line of text
    .slice(at + opening.length)
    .split("\n")
    .slice(1)) {
    const match = OPTION.exec(line);
    if (match) options.push({ text: match[1].trim() });
    else if (line.trim() !== "" && options.length > 0) break;
    else if (/^#{1,6}\s/.test(line)) break;
  }
  return options;
}

function lastText(body: Anthropic.MessageCreateParamsNonStreaming): string {
  const content = body.messages[0]?.content;
  if (!Array.isArray(content)) return "";
  const last = content.at(-1);
  return last?.type === "text" ? last.text : "";
}

/**
 * For an extract request (#343), each question asked for becomes a draft of its type whose stem
 * is its opening and whose options are the `A.` lines under it, marks and all.
 */
function fakeExtract(body: Anthropic.MessageCreateParamsNonStreaming) {
  const text = documentText(body);
  const listed = /<question(?:s)?>\n([\s\S]*?)\n<\/question(?:s)?>/.exec(lastText(body));
  let questions: { field?: string; type?: string; opens?: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(listed?.[1] ?? "[]");
    questions = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    questions = [];
  }
  return Object.fromEntries(
    questions.map((question, index) => [
      question.field ?? `question_${index + 1}`,
      {
        draft: {
          type: question.type ?? "multiple_choice",
          stem: question.opens ?? "",
          options: optionsAfter(text, question.opens ?? ""),
        },
        sourceErrors: [],
      },
    ]),
  );
}

const isExtract = (body: Anthropic.MessageCreateParamsNonStreaming) => {
  const schema = body.output_config?.format as { schema?: { properties?: object } } | undefined;
  return Object.hasOwn(schema?.schema?.properties ?? {}, "question_1");
};

export function fakeClaudeClient(): MessagesClient {
  return {
    messages: {
      async create(body) {
        return message(isExtract(body) ? fakeExtract(body) : fakeSegment(documentText(body)));
      },
    },
  };
}
