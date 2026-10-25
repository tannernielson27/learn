/**
 * A student's results page for one ended live session, decided on the server.
 *
 * Everything the page hands the browser is in the view this returns, so this is where the rule is
 * kept: keys and rationales only once the session has ended, and only to the student who
 * answered. The order is the rule, as for an assignment's results (`src/lib/assignments/results.ts`):
 *
 *   1. The student's own result, through `public.my_live_result` as the student. It answers only
 *      for a session that has ended and a participant row linked to the caller. No rows means
 *      not-found, whether the session is running, someone else's or does not exist.
 *   2. Only then the questions the session reached, with their keys and rationales, as the service
 *      role. An answer is drawn against the key it was scored with (`session_responses.reveal`).
 *
 * Server only: it reaches `parseSubmission`, the scoring seam, and the whole patient record, which
 * it cuts to each question's step as the phone was shown it.
 */
import type { SetItem } from "@/lib/assignments/attemptScoring";
import type { ResultEntry, ResultOutcome } from "@/lib/assignments/results";
import { parseCaseStudyRuns } from "@/lib/live/caseStudyRuns";
import { roomRecord } from "@/lib/liveSupabase/viewEntries";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import { ehrRecordSchema, type EhrRecord, type Item } from "@/lib/ngn/schemas";
import { parseSubmission, withScoredReveal } from "@/lib/ngn/submit";
import type { ScoreResult, ScoringModel } from "@/lib/ngn/types";
import type { LiveAnswer, LiveQuestion, MyLiveResultRead } from "@/lib/supabase/liveResults";

export interface LiveResultsStore {
  /** The student's own result, as the student. */
  result(sessionId: string): Promise<MyLiveResultRead>;
  /** The items with their keys, as the service role. Only read once the result is found. */
  items(ids: readonly string[]): Promise<SetItem[] | null>;
}

export interface LiveResultsHeader {
  id: string;
  title: string;
  classId: string | null;
  className: string | null;
  closedAt: string | null;
}

/** One question as the student answered it, with the record beside it as the phone had it. */
export interface LiveResultEntry extends ResultEntry {
  /** Its place in the session's set, counting from 1: "Question 3". */
  position: number;
  record: EhrRecordView | null;
}

export type LiveResultsView =
  | { kind: "missing" }
  | { kind: "failed" }
  | { kind: "results"; header: LiveResultsHeader; entries: LiveResultEntry[] };

const SCORING_MODELS: ReadonlySet<string> = new Set<ScoringModel>([
  "zero_one",
  "plus_minus",
  "rationale",
]);

/** A stored mark as the score the renderers draw, or null when it is not whole. */
function scoreOf(answer: LiveAnswer): ScoreResult | null {
  if (answer.points === null || answer.maxPoints === null) return null;
  if (answer.model === null || !SCORING_MODELS.has(answer.model)) return null;
  if (!Array.isArray(answer.breakdown)) return null;
  return {
    points: answer.points,
    maxPoints: answer.maxPoints,
    model: answer.model as ScoringModel,
    breakdown: answer.breakdown as ScoreResult["breakdown"],
    ...(Array.isArray(answer.groups) ? { groups: answer.groups as ScoreResult["groups"] } : {}),
  };
}

function outcomeOf(item: Item, answer: LiveAnswer | null): ResultOutcome {
  if (answer === null) return { kind: "not_answered" };
  const parsed = parseSubmission({ response: answer.response }, item.type);
  const score = scoreOf(answer);
  if (!parsed.ok || score === null) return { kind: "unreadable" };
  return { kind: "answered", response: parsed.response, score };
}

function recordOf(value: unknown): EhrRecord | null {
  if (value === null || value === undefined) return null;
  const parsed = ehrRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function loadLiveResultPage(
  store: LiveResultsStore,
  sessionId: string,
): Promise<LiveResultsView> {
  const read = await store.result(sessionId);
  if (read.kind !== "found") return { kind: read.kind };
  const { result } = read;

  const set = await store.items(result.questions.map((question) => question.itemId));
  if (set === null) return { kind: "failed" };
  const byId = new Map(set.map((entry) => [entry.rowId, entry.item]));

  const record = recordOf(result.patientRecord);
  const runs = parseCaseStudyRuns(result.caseStudyRecords);
  const entryFor = (question: LiveQuestion): LiveResultEntry[] => {
    const current = byId.get(question.itemId);
    // An item deleted since: nothing to draw, and nothing it was answered with to draw it from.
    if (!current) return [];
    const item = question.answer ? withScoredReveal(current, question.answer.reveal) : current;
    return [
      {
        rowId: String(question.position),
        position: question.position,
        item,
        outcome: outcomeOf(item, question.answer),
        record: roomRecord(record, question.position, runs) ?? null,
      },
    ];
  };

  return {
    kind: "results",
    header: {
      id: result.sessionId,
      title: result.title,
      classId: result.classId,
      className: result.className,
      closedAt: result.closedAt,
    },
    entries: result.questions.flatMap(entryFor),
  };
}
