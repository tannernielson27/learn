import { ClaudeCallError, callStructured, type MessagesClient } from "@/lib/aiImport/claude";
import {
  AI_IMPORT_MODEL,
  NO_USAGE,
  PRICE_PER_MILLION,
  addUsage,
  type Usage,
} from "@/lib/aiImport/config";
import { planExtraction, type ExtractUnit } from "@/lib/aiImport/extract";
import {
  extractCaseStudy,
  extractQuestions,
  regionsOf,
  type UnitCall,
  type UnitDocument,
} from "@/lib/aiImport/extractQuestions";
import { unitPayload, wholeText } from "@/lib/aiImport/extractUnit";
import { prepareFile } from "@/lib/aiImport/files/prepare";
import { mergeSegments, type MergedQuestion } from "@/lib/aiImport/merge";
import type { StagedEntry } from "@/lib/aiImport/stage";
import { NOT_IMPORTABLE, type RecordedQuestion, type Recording } from "./files";
import { segmentPass, type CorpusFile } from "./productImport";

/**
 * The eval's import pipeline (#339), on the product's own code since #343, so the eval measures
 * what ships: `prepareFile` cuts the chunks the product sends, the server's `segmentChunk` reads
 * each (in halves when its answer runs out of room, #590), `mergeSegments` joins them,
 * `planExtraction` makes the product's units, and each unit runs as the server runs it
 * (`extractQuestions`, or `extractCaseStudy` with #344's assembly), charts included. Each call's
 * answer is written down as a recording for the scorer.
 *
 * Only `pnpm eval:ai-import` runs it against the API. Tests drive it with a fake client.
 */

export const EVAL_MODEL = AI_IMPORT_MODEL;
export type { MessagesClient };

export const costOf = (usage: Usage): number =>
  (usage.inputTokens * PRICE_PER_MILLION.input +
    usage.outputTokens * PRICE_PER_MILLION.output +
    usage.cacheWriteTokens * PRICE_PER_MILLION.cacheWrite +
    usage.cacheReadTokens * PRICE_PER_MILLION.cacheRead) /
  1e6;

export interface PipelineOptions {
  model?: string;
  now?: () => Date;
  /** The wait between retries; tests pass one that does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One file's chunks, each through the server's own request (`segmentChunk`), then merged. A
 * chunk whose answer runs out of room is read again in halves there (#590), so a document that
 * needs that is scored like any other, and not lost to the first `max_tokens` (#594).
 *
 * `spent` hears what each chunk's calls billed. A chunk that fails fails the document, with the
 * code the teacher's browser would get; its calls are not in the document's cost.
 */
async function segmentFile(
  client: MessagesClient,
  file: CorpusFile,
  options: PipelineOptions,
  spent: (usage: Usage) => void,
): Promise<MergedQuestion[]> {
  const { results, segments } = await segmentPass(file, client, { sleep: options.sleep });
  results.forEach((result, position) => {
    if (result.ok) return spent(result.usage);
    const reason = result.code === "claude_failed" ? `: ${result.reason}` : "";
    throw new Error(`the segment pass failed on part ${position + 1} (${result.code}${reason})`);
  });
  return mergeSegments(segments).questions;
}

/** The client, asked for `model` whatever the request names: the server always names its own. */
const onModel = (client: MessagesClient, model: string): MessagesClient => ({
  messages: { create: (body, options) => client.messages.create({ ...body, model }, options) },
});

/** The opening a chart request names, read back from its question block. */
function chartOpening(call: Parameters<UnitCall>[0]): string | undefined {
  const last = call.content.at(-1);
  const text = last?.type === "text" ? last.text : "";
  const quoted = /<question>\n([\s\S]*?)\n<\/question>/.exec(text)?.[1];
  try {
    return quoted ? (JSON.parse(quoted) as { opens?: string }).opens : undefined;
  } catch {
    return undefined;
  }
}

interface UnitRecord {
  questions: RecordedQuestion[];
  caseStudies: Recording["caseStudies"];
}

const recorded = (entry: StagedEntry, chart: unknown): RecordedQuestion =>
  entry.status === "not_importable"
    ? {
        opening: entry.opening,
        type: NOT_IMPORTABLE,
        reason: entry.reasons[0]?.message ?? "",
      }
    : {
        opening: entry.opening,
        type: entry.type ?? NOT_IMPORTABLE,
        ...(entry.draft !== null ? { draft: entry.draft } : {}),
        ...(chart !== undefined ? { chart } : {}),
      };

/** One unit, run as the server runs it, written down as part of a recording. */
async function runUnit(
  call: UnitCall,
  unit: ExtractUnit,
  questions: readonly MergedQuestion[],
  document: UnitDocument,
  regions: ReadonlyMap<number, string | null>,
): Promise<UnitRecord> {
  const charts = new Map<string, unknown>();
  let caseCharts: unknown;
  const watched: UnitCall = async (request, purpose) => {
    const answer = await call(request, purpose);
    if (purpose === "chart") {
      const opening = chartOpening(request);
      if (opening !== undefined) charts.set(opening, answer.value);
      else caseCharts = answer.value;
    }
    return answer;
  };
  if (unit.caseStudy === null) {
    const entries = await extractQuestions(watched, questions, document, regions);
    return {
      questions: entries.map((entry) => recorded(entry, charts.get(entry.opening))),
      caseStudies: [],
    };
  }
  const entries = await extractCaseStudy(watched, unit.caseStudy, questions, document, regions);
  // One case study holds its steps' drafts; a split group, each question its own.
  const whole = entries.find((entry) => entry.kind === "case_study");
  const steps = whole
    ? (whole.draft as { steps: unknown[] }).steps
    : entries
        .filter((entry) => entry.status !== "not_importable" && entry.draft !== null)
        .map((entry) => entry.draft);
  return {
    questions: entries
      .filter((entry) => entry.status === "not_importable")
      .map((entry) => recorded(entry, undefined)),
    caseStudies: [
      {
        draft: {
          ...(typeof caseCharts === "object" && caseCharts !== null ? caseCharts : {}),
          title: (caseCharts as { title?: unknown } | undefined)?.title ?? unit.caseStudy,
          steps,
        },
      },
    ],
  };
}

/** Reads one document the way the import will, and returns what came back as a recording. */
export async function runPipeline(
  client: MessagesClient,
  document: { name: string; bytes: Buffer },
  options: PipelineOptions = {},
): Promise<Recording & { usage: NonNullable<Recording["usage"]> }> {
  const model = options.model ?? EVAL_MODEL;
  const bytes = new Uint8Array(document.bytes);
  const prepared = await prepareFile(bytes, document.name);
  if (!prepared.ok) throw new Error(`${document.name}: ${prepared.code}`);

  let usage: Usage = NO_USAGE;
  const call: UnitCall = async (request) => {
    try {
      const answer = await callStructured(client, request, { model, sleep: options.sleep });
      usage = addUsage(usage, answer.usage);
      return answer;
    } catch (error) {
      if (error instanceof ClaudeCallError) usage = addUsage(usage, error.usage);
      throw error;
    }
  };

  const merged = await segmentFile(
    onModel(client, model),
    { name: document.name, bytes, prepared },
    options,
    (spent) => {
      usage = addUsage(usage, spent);
    },
  );
  // The product's own join (#592): the chunks with what was cut from between them.
  const sourceText = wholeText(prepared);
  const regions = regionsOf(merged, sourceText);

  const questions: RecordedQuestion[] = [];
  const caseStudies: Recording["caseStudies"] = [];
  for (const unit of planExtraction(merged)) {
    const inUnit = merged.filter((question) => unit.positions.includes(question.position));
    try {
      const chunks = [...new Set(inUnit.flatMap((question) => question.chunks))];
      const { payload } = await unitPayload(bytes, prepared, chunks);
      const result = await runUnit(
        call,
        unit,
        inUnit,
        { payload, kind: prepared.kind, sourceText },
        regions,
      );
      questions.push(...result.questions);
      caseStudies.push(...result.caseStudies);
    } catch (error) {
      if (unit.caseStudy !== null) {
        caseStudies.push({ draft: { title: unit.caseStudy, error: message(error) } });
        continue;
      }
      questions.push(
        ...inUnit.map((question) => ({
          opening: question.excerpt,
          type: question.type ?? NOT_IMPORTABLE,
          reason: `extract failed: ${message(error)}`,
        })),
      );
    }
  }

  return {
    document: document.name,
    source: model,
    recordedAt: (options.now ?? (() => new Date()))().toISOString(),
    questions,
    caseStudies,
    usage: {
      inputTokens: usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens,
      outputTokens: usage.outputTokens,
      costUsd: Number(costOf(usage).toFixed(4)),
    },
  };
}
