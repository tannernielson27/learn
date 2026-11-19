import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "@/lib/aiImport/claude";
import { reply } from "@/lib/aiImport/testing/messages";
import { questionText } from "./corpus/generate/shared";
import type { Recording } from "./files";

/**
 * A scripted stand-in for Claude that answers as a faithful model would (#594): it lists the
 * questions that are in the part it was sent, and only those, copies the key lines that part
 * prints, and returns each question's recorded draft when asked for it. It reads the request, so
 * a chunk, a half of a chunk and a range of PDF pages each get the answer that belongs to them.
 *
 * It makes no network call. A request it cannot answer faithfully is written to `faults`, which
 * a test expects to be empty.
 */

type Body = Anthropic.MessageCreateParamsNonStreaming;

/** One question as the document prints it, and what a faithful model returns for it. */
export interface ScriptedQuestion {
  /** The opening the segment pass copies: about the first thirty words. */
  opening: string;
  /** The whole stem, as the product's text of the document has it: how a part is searched. */
  stem: string;
  /** The number or label printed before it. */
  number: string;
  type: string;
  draft: unknown;
  caseStudy?: { title: string; step: number };
  /** PDF only: the page it starts on, from 1. */
  page?: number;
}

export interface Script {
  questions: readonly ScriptedQuestion[];
  /** The answer of a case study's chart call: its title, patient header and charts. */
  caseStudy?: { title: string; patient: unknown; charts: unknown };
  /** The heading over a key printed apart from the questions, as "12. B" lines. */
  answerKeyHeading?: string;
}

/**
 * The script for a document of standalone questions printed "1.", "2.", ...: its recording's
 * questions in order, each on its page of `pages` when the document is a PDF.
 */
export function numberedScript(
  recording: Recording,
  rest: Partial<Script> = {},
  pages?: readonly number[],
): Script {
  return {
    ...rest,
    questions: recording.questions.map((question, index) => ({
      opening: question.opening,
      stem: questionText((question.draft as { stem: string }).stem),
      number: String(index + 1),
      type: question.type,
      draft: question.draft,
      ...(pages ? { page: pages[index] } : {}),
    })),
  };
}

export interface FaithfulOptions {
  /**
   * The most questions one segment answer has room for. Asked to list more, the model runs out
   * of room and its answer is cut off (`max_tokens`), as the 2026-10-22 import's was (#590).
   */
  roomFor?: number;
}

export interface ModelCall {
  kind: "segment" | "extract" | "charts";
  /** The text the call was sent; null for PDF pages. */
  document: string | null;
  /** Questions listed (segment) or drafted (extract). */
  questions: number;
  /** The length of the answer as JSON. */
  answerChars: number;
  overflowed: boolean;
}

export interface FaithfulModel {
  client: MessagesClient;
  calls: ModelCall[];
  faults: string[];
}

const KEY_LINE = /^(\d+)\. ([A-Z](?:, [A-Z])*)$/gm;

const blocksOf = (body: Body): Anthropic.ContentBlockParam[] => {
  const content = body.messages[0]?.content;
  return Array.isArray(content) ? content : [];
};

const textsOf = (body: Body): string[] =>
  blocksOf(body)
    .filter((block): block is Anthropic.TextBlockParam => block.type === "text")
    .map((block) => block.text);

/** The text inside the request's `<document>` tags; null when the document is PDF pages. */
function documentOf(body: Body): string | null {
  const block = textsOf(body).find((text) => text.startsWith("<document>\n"));
  return block === undefined ? null : block.slice("<document>\n".length, -"\n</document>".length);
}

const askOf = (body: Body): string => textsOf(body).at(-1) ?? "";

const propertiesOf = (body: Body): Record<string, unknown> =>
  (body.output_config?.format?.schema as { properties?: Record<string, unknown> } | undefined)
    ?.properties ?? {};

/** A cut this deep into a stem, from either end, is a cut through the question. */
const EDGE_CHARS = 20;

/**
 * A question whose stem the edge of `text` runs through: the part ends inside it, or opens
 * inside it. A real model marks such a question `cutOff` or `continued`; this one marks neither,
 * so it says so and answers nothing, and a test that meets it fails as the model's limit, not as
 * a question the product lost.
 */
function cutByEdge(script: Script, text: string): ScriptedQuestion | undefined {
  const [start, end] = [text.trimStart(), text.trimEnd()];
  return script.questions.find(({ stem }) => {
    if (text.includes(stem)) return false;
    for (let at = EDGE_CHARS; at <= stem.length - EDGE_CHARS; at += 1) {
      if (end.endsWith(stem.slice(0, at)) || start.startsWith(stem.slice(at))) return true;
    }
    return false;
  });
}

/** The questions in the part a segment request carries, with each one's page within that part. */
function inPart(script: Script, body: Body): { question: ScriptedQuestion; page?: number }[] {
  const text = documentOf(body);
  if (text !== null) {
    const cut = cutByEdge(script, text);
    if (cut) throw new Error(`the part's edge runs through a question: ${cut.opening}`);
    return script.questions
      .filter((question) => text.includes(question.stem))
      .map((question) => ({ question }));
  }
  const pages = /pages (\d+) to (\d+)/.exec(askOf(body));
  if (!pages) throw new Error("a PDF part that does not say which pages it holds");
  const [from, to] = [Number(pages[1]), Number(pages[2])];
  return script.questions
    .filter(({ page }) => page !== undefined && page >= from && page <= to)
    .map((question) => ({ question, page: (question.page ?? from) - from + 1 }));
}

/** The key lines a text part prints under the answer key's heading. */
function keyLines(script: Script, text: string | null) {
  const at = script.answerKeyHeading && text !== null ? text.indexOf(script.answerKeyHeading) : -1;
  if (text === null || at < 0) return [];
  return [...text.slice(at).matchAll(KEY_LINE)].map((line) => ({
    number: line[1],
    kind: "answer",
    text: line[2],
  }));
}

function segmentAnswer(script: Script, body: Body) {
  const questions = inPart(script, body).map(({ question, page }) => ({
    excerpt: question.opening,
    number: question.number,
    ...(page !== undefined ? { page } : {}),
    type: question.type,
    confidence: 0.95,
    ...(question.caseStudy ? { caseStudy: question.caseStudy } : {}),
    instructorNote: false,
    reliesOnImage: false,
    cutOff: false,
    continued: false,
  }));
  return { questions, answers: keyLines(script, documentOf(body)) };
}

function extractAnswer(script: Script, body: Body): Record<string, unknown> {
  const listed: unknown = JSON.parse(
    /<questions>\n([\s\S]*)\n<\/questions>/.exec(askOf(body))?.[1] ?? "null",
  );
  // A repair request names one `<question>`: a faithful draft converts, so none is expected.
  if (!Array.isArray(listed)) throw new Error("asked for something other than drafts (a repair?)");
  return Object.fromEntries(
    (listed as { field: string; opens: string }[]).map((asked) => {
      const found = script.questions.find((question) => question.opening === asked.opens);
      if (!found)
        throw new Error(`asked for a question the document does not have: ${asked.opens}`);
      return [asked.field, { draft: found.draft, sourceErrors: [] }];
    }),
  );
}

function answerTo(script: Script, body: Body): { kind: ModelCall["kind"]; value: unknown } {
  const properties = propertiesOf(body);
  if ("questions" in properties) return { kind: "segment", value: segmentAnswer(script, body) };
  // #604: the header in one call, each step's chart in one more.
  if ("patient" in properties || "tabs" in properties) {
    const study = script.caseStudy;
    if (!study) throw new Error("asked for the record of a case study it has none of");
    if ("patient" in properties) {
      return { kind: "charts", value: { title: study.title, patient: study.patient } };
    }
    const asked = /<case_study>\n([\s\S]*?)\n<\/case_study>/.exec(askOf(body))?.[1] ?? "{}";
    const { step } = JSON.parse(asked) as { step: number };
    return { kind: "charts", value: (study.charts as unknown[])[step - 1] };
  }
  return { kind: "extract", value: extractAnswer(script, body) };
}

const countOf = (value: unknown): number => {
  const questions = (value as { questions?: unknown[] }).questions;
  return Array.isArray(questions) ? questions.length : Object.keys(value as object).length;
};

export function faithfulModel(script: Script, options: FaithfulOptions = {}): FaithfulModel {
  // A part is searched for each whole stem, so one stem inside another would be listed twice.
  const stems = script.questions.map((question) => question.stem);
  const inside = stems.find((stem, at) =>
    stems.some((other, o) => o !== at && other.includes(stem)),
  );
  if (inside !== undefined) throw new Error(`one stem is part of another: ${inside}`);
  const calls: ModelCall[] = [];
  const faults: string[] = [];
  const create = async (body: Body): Promise<Anthropic.Message> => {
    let answered: ReturnType<typeof answerTo>;
    try {
      answered = answerTo(script, body);
    } catch (error) {
      faults.push(error instanceof Error ? error.message : String(error));
      throw error;
    }
    const json = JSON.stringify(answered.value);
    const questions = countOf(answered.value);
    const overflowed =
      answered.kind === "segment" && options.roomFor !== undefined && questions > options.roomFor;
    calls.push({
      kind: answered.kind,
      document: documentOf(body),
      questions,
      answerChars: json.length,
      overflowed,
    });
    // An answer that ran out of room stops mid-list, having used every token it was allowed.
    return overflowed
      ? reply(json.slice(0, json.length / 2), { stop: "max_tokens", output: body.max_tokens })
      : reply(json);
  };
  return { client: { messages: { create } } as MessagesClient, calls, faults };
}
