import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

/**
 * The after-session report (#186): how each student did on each item, how each item went, and
 * how the class did at each step of the clinical judgment model.
 *
 * Pure: the rows it is given are what the host's own row level security let them read, already
 * narrowed to one session. It decides nothing about who may see them.
 */

export interface ReportItemInput {
  /** Where the item sat in the session, counting from 1. */
  position: number;
  itemId: string;
  /** The item's own stable id (`content.id`), which an author recognises. */
  ref: string;
  type: string | null;
  cjmmStep: CjmmStep | null;
}

export interface ReportParticipantInput {
  id: string;
  displayName: string;
  joinedAt: string;
}

export interface ReportResponseInput {
  participantId: string;
  itemPosition: number;
  points: number;
  maxPoints: number;
}

export interface SessionReportInput {
  items: readonly ReportItemInput[];
  participants: readonly ReportParticipantInput[];
  responses: readonly ReportResponseInput[];
}

export interface Score {
  points: number;
  maxPoints: number;
}

export interface StudentRow {
  participantId: string;
  displayName: string;
  /** One entry per item, in item order; null where the student did not answer. */
  scores: (Score | null)[];
  answered: number;
  points: number;
  /** What every item anyone answered was worth: a skipped item counts against the total. */
  possible: number;
  /** 0-100, or null when nothing in the session was worth anything. */
  percent: number | null;
}

export interface ItemRow {
  position: number;
  itemId: string;
  ref: string;
  type: string | null;
  cjmmStep: CjmmStep | null;
  responded: number;
  unanswered: number;
  full: number;
  partial: number;
  none: number;
  meanPoints: number | null;
  /** What the item was worth, as its answers were scored; null when nobody answered it. */
  maxPoints: number | null;
  meanPercent: number | null;
}

export interface StepRow {
  step: CjmmStep;
  label: string;
  itemCount: number;
  responded: number;
  /** The mean of the tagged items' mean percents, each item counting once. */
  meanPercent: number | null;
}

export interface SessionReport {
  items: ItemRow[];
  students: StudentRow[];
  steps: StepRow[];
}

type ScoreKey = `${string}@${number}`;
const keyOf = (participantId: string, position: number): ScoreKey => `${participantId}@${position}`;

export function buildSessionReport(input: SessionReportInput): SessionReport {
  const items = [...input.items].sort((a, b) => a.position - b.position);
  const scores = indexScores(input, items);
  const itemRows = items.map((item) => itemRow(item, input.participants, scores));
  return {
    items: itemRows,
    students: studentRows(input.participants, itemRows, scores),
    steps: stepRows(itemRows),
  };
}

/** Answers that belong to someone on the roster at a position in the session; the rest are ignored. */
function indexScores(
  input: SessionReportInput,
  items: readonly ReportItemInput[],
): ReadonlyMap<ScoreKey, Score> {
  const people = new Set(input.participants.map((person) => person.id));
  const positions = new Set(items.map((item) => item.position));
  return new Map(
    input.responses
      .filter((r) => people.has(r.participantId) && positions.has(r.itemPosition))
      .map((r) => [
        keyOf(r.participantId, r.itemPosition),
        { points: r.points, maxPoints: r.maxPoints },
      ]),
  );
}

/** The live dashboard's rules: full when everything on offer was earned, partial when something was. */
function markOf(score: Score): "full" | "partial" | "none" {
  if (score.points >= score.maxPoints) return "full";
  return score.points > 0 ? "partial" : "none";
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

function itemRow(
  item: ReportItemInput,
  participants: readonly ReportParticipantInput[],
  scores: ReadonlyMap<ScoreKey, Score>,
): ItemRow {
  const answers = participants.flatMap((person) => {
    const score = scores.get(keyOf(person.id, item.position));
    return score ? [score] : [];
  });
  const marks = answers.map(markOf);
  const meanPoints = mean(answers.map((score) => score.points));
  const maxPoints = answers.length === 0 ? null : Math.max(...answers.map((s) => s.maxPoints));
  return {
    position: item.position,
    itemId: item.itemId,
    ref: item.ref,
    type: item.type,
    cjmmStep: item.cjmmStep,
    responded: answers.length,
    unanswered: participants.length - answers.length,
    full: marks.filter((mark) => mark === "full").length,
    partial: marks.filter((mark) => mark === "partial").length,
    none: marks.filter((mark) => mark === "none").length,
    meanPoints,
    maxPoints,
    meanPercent:
      meanPoints !== null && maxPoints !== null && maxPoints > 0
        ? (meanPoints / maxPoints) * 100
        : null,
  };
}

function studentRows(
  participants: readonly ReportParticipantInput[],
  items: readonly ItemRow[],
  scores: ReadonlyMap<ScoreKey, Score>,
): StudentRow[] {
  const possible = items.reduce((sum, item) => sum + (item.maxPoints ?? 0), 0);
  return [...participants].sort(byName).map((person) => {
    const row = items.map((item) => scores.get(keyOf(person.id, item.position)) ?? null);
    const points = row.reduce((sum, score) => sum + (score?.points ?? 0), 0);
    return {
      participantId: person.id,
      displayName: person.displayName,
      scores: row.map((score) => (score ? { ...score } : null)),
      answered: row.filter((score) => score !== null).length,
      points,
      possible,
      percent: possible > 0 ? (points / possible) * 100 : null,
    };
  });
}

/** Alphabetical, ignoring case; the same name twice goes by who joined first. */
function byName(a: ReportParticipantInput, b: ReportParticipantInput): number {
  return (
    a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }) ||
    a.joinedAt.localeCompare(b.joinedAt) ||
    a.id.localeCompare(b.id)
  );
}

const STEPS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

function stepRows(items: readonly ItemRow[]): StepRow[] {
  return STEPS.flatMap((step) => {
    const tagged = items.filter((item) => item.cjmmStep === step);
    if (tagged.length === 0) return [];
    const percents = tagged.flatMap((item) =>
      item.meanPercent === null ? [] : [item.meanPercent],
    );
    return [
      {
        step,
        label: CJMM_STEP_LABELS[step],
        itemCount: tagged.length,
        responded: tagged.reduce((sum, item) => sum + item.responded, 0),
        meanPercent: mean(percents),
      },
    ];
  });
}
