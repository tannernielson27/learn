import type Anthropic from "@anthropic-ai/sdk";
import { caseStudyChartsJsonSchema } from "@/lib/ngn/draft";
import { ClaudeCallError, callStructured, type MessagesClient } from "@/lib/aiImport/claude";
import {
  AI_IMPORT_MODEL,
  EXTRACT_MAX_TOKENS,
  NO_USAGE,
  PRICE_PER_MILLION,
  addUsage,
  type Usage,
} from "@/lib/aiImport/config";
import { EXTRACT_RULES, planExtraction } from "@/lib/aiImport/extract";
import { extractQuestions, regionsOf, type UnitCall } from "@/lib/aiImport/extractQuestions";
import { unitPayload } from "@/lib/aiImport/extractUnit";
import { DOCX_MARKUP } from "@/lib/aiImport/files/docx";
import { chunkPayload, prepareFile, type PreparedFile } from "@/lib/aiImport/files/prepare";
import { mergeSegments, type MergedQuestion } from "@/lib/aiImport/merge";
import { documentBlock, readSegment, segmentRequest } from "@/lib/aiImport/segment";
import { NOT_IMPORTABLE, type RecordedQuestion, type Recording } from "./files";

/**
 * The eval's import pipeline (#339, moved onto the product by #343): the product's own segment
 * pass (`src/lib/aiImport/segment.ts`) on each chunk the product cuts, its merge, and its extract
 * pass with the one repair (`extractQuestions`), so the eval measures what ships. Only the case
 * study charts are still the eval's own call, a stand-in until #344 assembles case studies in
 * `src/lib/aiImport`; their steps go through the product's extract pass.
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

/** One file's chunks, segmented and merged, as the product does it. */
async function segmentFile(
  call: UnitCall,
  bytes: Uint8Array,
  prepared: PreparedFile,
): Promise<MergedQuestion[]> {
  const segments = [];
  for (const chunk of prepared.chunks) {
    const payload = await chunkPayload(bytes, prepared, chunk.position);
    const ref = {
      position: chunk.position,
      of: prepared.chunks.length,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
    };
    const answer = await call(segmentRequest(payload, prepared.kind, ref), "extract");
    segments.push(readSegment(answer.value, ref, payload));
  }
  return mergeSegments(segments).questions;
}

/** The questions at `positions`, in the units the product would send them in. */
function unitsOf(questions: readonly MergedQuestion[], positions: ReadonlySet<number>) {
  const chosen = questions.filter((question) => positions.has(question.position));
  return planExtraction(chosen).units.map((unit) =>
    chosen.filter((question) => unit.positions.includes(question.position)),
  );
}

/** The case study's title, patient and charts: the eval's stand-in for #344. */
async function chartsOf(
  call: UnitCall,
  title: string,
  payload: Awaited<ReturnType<typeof unitPayload>>["payload"],
  kind: PreparedFile["kind"],
): Promise<Record<string, unknown>> {
  const content: Anthropic.ContentBlockParam[] = [
    ...(kind === "docx" ? [{ type: "text" as const, text: DOCX_MARKUP }] : []),
    documentBlock(payload),
    {
      type: "text",
      text: `Copy the case study titled ${JSON.stringify(title)}: its title, the patient header, and its chart as the source shows it with each step.`,
    },
  ];
  const answer = await call(
    {
      system: EXTRACT_RULES,
      schema: caseStudyChartsJsonSchema(),
      content,
      maxTokens: EXTRACT_MAX_TOKENS,
    },
    "extract",
  );
  return answer.value as Record<string, unknown>;
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

  const merged = await segmentFile(call, bytes, prepared);
  const sourceText =
    prepared.kind === "pdf" ? null : prepared.chunks.map((chunk) => chunk.text ?? "").join("");
  const regions = regionsOf(merged, sourceText);
  // Every group is assembled here (#344's stand-in); everything else is a standalone question.
  const plan = planExtraction(merged, (_, groups) => ({
    assembled: groups.flatMap((group) => group.positions),
  }));
  const grouped = new Set(plan.caseStudyGroups.flatMap((group) => group.positions));

  const drafts = new Map<number, { draft?: unknown; reason?: string }>();
  const extractAll = async (positions: ReadonlySet<number>) => {
    for (const unit of unitsOf(merged, positions)) {
      try {
        const { payload } = await unitPayload(bytes, prepared, unit[0].chunks);
        const entries = await extractQuestions(
          call,
          unit,
          { payload, kind: prepared.kind, sourceText },
          regions,
        );
        for (const entry of entries) {
          drafts.set(entry.position, entry.draft === null ? {} : { draft: entry.draft });
        }
      } catch (error) {
        for (const question of unit) {
          drafts.set(question.position, { reason: `extract failed: ${message(error)}` });
        }
      }
    }
  };

  await extractAll(new Set(merged.filter((q) => !grouped.has(q.position)).map((q) => q.position)));
  const questions: RecordedQuestion[] = merged
    .filter((question) => !grouped.has(question.position))
    .map((question) => {
      if (question.type === null) {
        return {
          opening: question.excerpt,
          type: NOT_IMPORTABLE,
          reason: question.flags.notNgn ?? "",
        };
      }
      return { opening: question.excerpt, type: question.type, ...drafts.get(question.position) };
    });

  const caseStudies = [];
  for (const group of plan.caseStudyGroups) {
    try {
      const steps = merged.filter((question) => group.positions.includes(question.position));
      const chunks = [...new Set(steps.flatMap((step) => step.chunks))];
      const { payload } = await unitPayload(bytes, prepared, chunks);
      const charts = await chartsOf(call, group.title, payload, prepared.kind);
      await extractAll(new Set(group.positions));
      caseStudies.push({
        draft: { ...charts, steps: steps.map((step) => drafts.get(step.position)?.draft) },
      });
    } catch (error) {
      caseStudies.push({ draft: { title: group.title, error: message(error) } });
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
