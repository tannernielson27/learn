import type { StructuredAnswer, StructuredRequest } from "./claude";
import { extractRequest, readExtraction, repairRequest, type ExtractedDraft } from "./extract";
import type { ChunkPayload } from "./files/prepare";
import type { FileKind } from "./files/sniff";
import { questionRegions } from "./keyEvidence";
import type { MergedQuestion } from "./merge";
import {
  convertDraft,
  needsRepair,
  stageQuestion,
  type Converted,
  type StagedEntry,
} from "./stage";

/**
 * One unit's questions through extract, validate and repair (#343), with the Claude call handed
 * in: the server wraps it in a reservation and a settlement (`extractUnit`), the eval calls the
 * API directly (`test/ai-import/pipeline.ts`). No database here.
 *
 * The extract call's failure is the unit's: it throws, nothing is staged, and the unit is tried
 * again later. A repair call's failure is the question's: it stays `needs_fix`, draft kept.
 */

export type UnitCall = (
  request: StructuredRequest,
  purpose: "extract" | "repair",
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

async function repaired(
  call: UnitCall,
  question: MergedQuestion,
  extracted: ExtractedDraft | undefined,
  converted: Converted,
  document: UnitDocument,
): Promise<{ extracted: ExtractedDraft | undefined; converted: Converted }> {
  const problems = converted.problems.length
    ? converted.problems
    : [{ path: [], message: "No draft was given for this question." }];
  try {
    const answer = await call(
      repairRequest(question, extracted?.draft ?? null, problems, document.payload, document.kind),
      "repair",
    );
    const [again] = readExtraction(answer.value, 1);
    if (!again) return { extracted, converted };
    return {
      extracted: {
        draft: again.draft,
        sourceErrors: again.sourceErrors.length
          ? again.sourceErrors
          : (extracted?.sourceErrors ?? []),
      },
      converted: convertDraft(again.draft),
    };
  } catch {
    // The first draft is kept and staged as it stands; the call has been settled by the caller.
    return { extracted, converted };
  }
}

/**
 * Stages `questions` (one unit), in order. `regions` comes from `regionsOf` over the whole file,
 * so a question's part of the text ends where the next one starts.
 */
export async function extractQuestions(
  call: UnitCall,
  questions: readonly MergedQuestion[],
  document: UnitDocument,
  regions: ReadonlyMap<number, string | null>,
): Promise<StagedEntry[]> {
  const source = document.sourceText === null ? "pdf" : "text";
  const stageOne = (
    question: MergedQuestion,
    extracted: ExtractedDraft | undefined,
    converted: Converted | undefined,
  ) =>
    stageQuestion({
      question,
      extracted,
      converted,
      source,
      region: regions.get(question.position) ?? null,
    });

  const drafted = questions.filter((question) => question.type !== null);
  const byPosition = new Map<number, StagedEntry>();
  for (const question of questions) {
    if (question.type === null) {
      byPosition.set(question.position, stageOne(question, undefined, undefined));
    }
  }
  if (drafted.length > 0) {
    const answer = await call(extractRequest(drafted, document.payload, document.kind), "extract");
    const extractedAll = readExtraction(answer.value, drafted.length);
    for (const [index, question] of drafted.entries()) {
      let extracted = extractedAll[index];
      let converted: Converted =
        extracted === undefined ? { ok: false, problems: [] } : convertDraft(extracted.draft);
      if (needsRepair(converted)) {
        ({ extracted, converted } = await repaired(call, question, extracted, converted, document));
      }
      byPosition.set(question.position, stageOne(question, extracted, converted));
    }
  }
  return questions.map((question) => byPosition.get(question.position)!);
}
