import type { StructuredAnswer, StructuredRequest } from "./claude";
import { EXTRACT_PER_CALL } from "./config";
import {
  caseStudyChartsRequest,
  extractRequest,
  readExtraction,
  repairRequest,
  standaloneChartRequest,
  type ExtractedDraft,
} from "./extract";
import type { ChunkPayload } from "./files/prepare";
import type { FileKind } from "./files/sniff";
import { questionRegions } from "./keyEvidence";
import type { MergedQuestion } from "./merge";
import {
  convertDraft,
  needsRepair,
  stageCaseStudy,
  stageQuestion,
  type Converted,
  type StagedEntry,
} from "./stage";

/**
 * One unit's questions through extract, validate and repair (#343), then #344's assembly, with
 * the Claude call handed in: the server wraps it in a reservation and a settlement
 * (`extractUnit`), the eval calls the API directly (`test/ai-import/pipeline.ts`). No database.
 *
 * An extract call's failure is the unit's: it throws, nothing is staged, and the unit is tried
 * again later. A repair call's or a chart call's failure is the question's: it is staged without
 * it (needs_fix, draft kept; or a case study whose chart could not be read).
 */

export type UnitCall = (
  request: StructuredRequest,
  purpose: "extract" | "repair" | "chart",
) => Promise<StructuredAnswer>;

export interface UnitDocument {
  /** What Claude reads: the chunks the unit's questions came from. */
  payload: ChunkPayload;
  kind: FileKind;
  /** The whole file's text for a text source, to find each question's part of it; null for PDF. */
  sourceText: string | null;
}

/** Each question's part of the file's text, by position; empty for a PDF. */
export function regionsOf(
  questions: readonly MergedQuestion[],
  sourceText: string | null,
): Map<number, string | null> {
  if (sourceText === null) return new Map();
  const regions = questionRegions(
    sourceText,
    questions.map((question) => question.excerpt),
  );
  return new Map(questions.map((question, index) => [question.position, regions[index]]));
}

interface Drafted {
  question: MergedQuestion;
  extracted: ExtractedDraft | undefined;
  converted: Converted;
}

async function repaired(
  call: UnitCall,
  drafted: Drafted,
  document: UnitDocument,
): Promise<Drafted> {
  const { question, extracted, converted } = drafted;
  const problems = converted.problems.length
    ? converted.problems
    : [{ path: [], message: "No draft was given for this question." }];
  try {
    const answer = await call(
      repairRequest(question, extracted?.draft ?? null, problems, document.payload, document.kind),
      "repair",
    );
    const [again] = readExtraction(answer.value, 1);
    if (!again) return drafted;
    return {
      question,
      extracted: {
        draft: again.draft,
        sourceErrors: again.sourceErrors.length
          ? again.sourceErrors
          : (extracted?.sourceErrors ?? []),
      },
      converted: convertDraft(again.draft),
    };
  } catch {
    // The first draft is kept and staged as it stands; the caller settled the call.
    return drafted;
  }
}

/** Drafts for `questions` (all with a type), extracted two to a call at once, each repaired once. */
async function draftAll(
  call: UnitCall,
  questions: readonly MergedQuestion[],
  document: UnitDocument,
): Promise<Drafted[]> {
  const pairs: MergedQuestion[][] = [];
  for (let start = 0; start < questions.length; start += EXTRACT_PER_CALL) {
    pairs.push(questions.slice(start, start + EXTRACT_PER_CALL));
  }
  const answers = await Promise.all(
    pairs.map((pair) =>
      call(extractRequest(pair, document.payload, document.kind), "extract").then((answer) =>
        readExtraction(answer.value, pair.length),
      ),
    ),
  );
  const firsts = pairs.flatMap((pair, p) =>
    pair.map((question, index): Drafted => {
      const extracted = answers[p][index];
      return {
        question,
        extracted,
        converted:
          extracted === undefined ? { ok: false, problems: [] } : convertDraft(extracted.draft),
      };
    }),
  );
  return Promise.all(
    firsts.map((drafted) =>
      needsRepair(drafted.converted) ? repaired(call, drafted, document) : drafted,
    ),
  );
}

/** The answer of a chart call, or undefined when it failed. */
async function chartOf(call: UnitCall, request: StructuredRequest): Promise<unknown> {
  try {
    return (await call(request, "chart")).value;
  } catch {
    return undefined;
  }
}

/**
 * Stages `questions` (one standalone unit), in order. A question the segment pass saw with its own
 * chart has it read in a call of its own. `regions` comes from `regionsOf` over the whole file,
 * so a question's part of the text ends where the next one starts.
 */
export async function extractQuestions(
  call: UnitCall,
  questions: readonly MergedQuestion[],
  document: UnitDocument,
  regions: ReadonlyMap<number, string | null>,
): Promise<StagedEntry[]> {
  const source = document.sourceText === null ? "pdf" : "text";
  const region = (question: MergedQuestion) => regions.get(question.position) ?? null;
  const typed = questions.filter((question) => question.type !== null);
  const charted = typed.filter((question) => question.flags.ownChart);
  const [drafted, charts] = await Promise.all([
    typed.length > 0 ? draftAll(call, typed, document) : Promise.resolve([]),
    Promise.all(
      charted.map((question) =>
        chartOf(call, standaloneChartRequest(question, document.payload, document.kind)),
      ),
    ),
  ]);
  const chartFor = new Map(charted.map((question, index) => [question.position, charts[index]]));
  const byPosition = new Map(drafted.map((entry) => [entry.question.position, entry]));
  return questions.map((question) => {
    const entry = byPosition.get(question.position);
    const chart = chartFor.has(question.position) ? chartFor.get(question.position) : undefined;
    return stageQuestion({
      question,
      extracted: entry?.extracted,
      converted: entry?.converted,
      source,
      region: region(question),
      ...(question.flags.ownChart ? { chart: chart ?? { unreadable: true } } : {}),
    });
  });
}

/**
 * Stages one case study group (a unit with a `caseStudy` title): its steps' drafts and its charts,
 * all asked for at once, then assembled by #344.
 */
export async function extractCaseStudy(
  call: UnitCall,
  title: string,
  questions: readonly MergedQuestion[],
  document: UnitDocument,
  regions: ReadonlyMap<number, string | null>,
): Promise<StagedEntry[]> {
  const typed = questions.filter((question) => question.type !== null);
  const [drafted, charts] = await Promise.all([
    typed.length > 0 ? draftAll(call, typed, document) : Promise.resolve([]),
    typed.length > 0
      ? chartOf(call, caseStudyChartsRequest(title, document.payload, document.kind))
      : Promise.resolve(undefined),
  ]);
  const byPosition = new Map(drafted.map((entry) => [entry.question.position, entry]));
  return stageCaseStudy({
    title,
    charts,
    source: document.sourceText === null ? "pdf" : "text",
    steps: questions.map((question) => {
      const entry = byPosition.get(question.position);
      return {
        question,
        extracted: entry?.extracted,
        converted: entry?.converted,
        region: regions.get(question.position) ?? null,
      };
    }),
  });
}
