/**
 * What each live screen shows, as data (docs/ui-overhaul PLAN §10, F1): one pure function per
 * screen from the room's state to a discriminated union the screen switches on.
 *
 * - `stageView`: the projector. No controls and no names after the lobby (owner decision 4).
 * - `controlView`: the teacher's console. The stage's phases, plus the names, the connection and
 *   the buttons on offer, from the same command rules every console uses (`controls.ts`).
 * - `phoneView`: a student's phone, in the named states Socrative documents (PLAN §5.6).
 *
 * **No answer key reaches a phone before the reveal.** `phoneView` hands on an item reveal only
 * when the room is showing the answer to the item it is on, and it strips the three answer-bearing
 * fields from the item even though a participant's item never has them (`ParticipantItem`): a
 * mis-wired adapter should cost a test, not a class's answers. `views.test.ts` proves both.
 *
 * Nothing here imports the scoring engine or the results code: a phone imports this file, and
 * `noClientScoring.test.ts` and `noClientResults.test.ts` hold every phone to that.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { runAt, type CaseStudyRun } from "./caseStudyRuns";
import { controlCommands, type ControlCommand } from "./controls";
import { positionLabel } from "./positionLabel";
import { isStudentPaced, type LiveSessionState } from "./state";
import { remainingMs, type ItemTimer } from "./timer";
import type { ItemReveal, LiveConnection, ParticipantItem } from "./transport";
import { waitingCopy } from "./waiting";

/** Where in a case study the room is: "Step 2 of 6", and the case study's title when known. */
export interface CaseStepPlace {
  /** Null for a session started from one case study, which names it in its own header. */
  caseStudyId: string | null;
  title: string | null;
  /** Counted from the case study's first position, 1 to 6. */
  step: number;
  stepCount: number;
}

/** Where in the set the room is. */
export interface RoomPlace {
  /** One-based. Null in a student-paced room, which is on no one item (#185). */
  position: number | null;
  itemCount: number;
  /** "Question 3 of 10", "Step 2 of 6: Analyze Cues" (`positionLabel`). Null with no position. */
  label: string | null;
  caseStep: CaseStepPlace | null;
}

/** How many have answered the item the room is on, out of how many have joined. */
export interface AnswerTally {
  /** From the host's tally; null until one about this item has arrived. */
  answered: number | null;
  joined: number;
}

/** What the stage says when the session is over (PLAN §5.11): calm numbers, no podium. */
export interface EndSummary {
  /** How far the room got: the items it was put on. Every item, for a student-paced room. */
  questionsRun: number;
  itemCount: number;
  joined: number;
}

/** The facts about a room a teacher's two views need beyond its state. */
export interface HostViewInput {
  state: LiveSessionState;
  code: string;
  /** Everyone who has joined, in join order. The stage shows them in the lobby only. */
  names: readonly string[];
  /** How many answered the item the room is on, from the tally; null when not known. */
  answered: number | null;
  connection: LiveConnection;
  /** Whether the session was started from one case study (#184). */
  caseStudy?: boolean;
  /** The current item's CJMM step, which names the step in a case study. */
  cjmmStep?: number | null;
  /** The case studies a whole-quiz room plays in place (#469). */
  runs?: readonly CaseStudyRun[];
}

interface OnItem {
  code: string;
  place: RoomPlace;
  tally: AnswerTally;
}

export type StageView =
  | { phase: "lobby"; code: string; names: readonly string[]; joined: number }
  | (OnItem & { phase: "question"; timer: ItemTimer })
  | (OnItem & { phase: "caseStep"; timer: ItemTimer; caseStep: CaseStepPlace })
  | (OnItem & { phase: "answerShowing" })
  | (OnItem & { phase: "paused"; timer: ItemTimer })
  | { phase: "ended"; summary: EndSummary };

export type StagePhase = StageView["phase"];

/** Everything the console has on top of what the stage shows. */
export interface ControlExtras {
  /** The buttons on offer, in order, each live or greyed out. */
  commands: ControlCommand[];
  connection: LiveConnection;
  /** The roster's names, in every phase: the console is private. */
  names: readonly string[];
  studentPaced: boolean;
}

export type ControlView = StageView & ControlExtras;

function caseStepAt(input: HostViewInput): CaseStepPlace | null {
  const { state } = input;
  if (state.position === null || isStudentPaced(state)) return null;
  const place = runAt(input.runs ?? [], state.position);
  if (place !== null) {
    return {
      caseStudyId: place.run.caseStudyId,
      title: place.run.title,
      step: place.step,
      stepCount: place.run.stepCount,
    };
  }
  if (!input.caseStudy) return null;
  return { caseStudyId: null, title: null, step: state.position, stepCount: state.itemCount };
}

function placeOf(state: LiveSessionState, input?: HostViewInput): RoomPlace {
  if (isStudentPaced(state)) {
    return { position: null, itemCount: state.itemCount, label: null, caseStep: null };
  }
  const caseStep = input ? caseStepAt(input) : null;
  const label = positionLabel(state, {
    caseStudy: input?.caseStudy ?? false,
    cjmmStep: input?.cjmmStep ?? null,
    run:
      caseStep !== null && caseStep.caseStudyId !== null
        ? { step: caseStep.step, stepCount: caseStep.stepCount }
        : null,
  });
  return { position: state.position, itemCount: state.itemCount, label, caseStep };
}

/** The projector's view of the room. */
export function stageView(input: HostViewInput): StageView {
  const { state, code, names } = input;
  const joined = names.length;
  if (state.status === "lobby") return { phase: "lobby", code, names: [...names], joined };
  if (state.status === "ended") {
    const questionsRun = isStudentPaced(state) ? state.itemCount : (state.position ?? 0);
    return { phase: "ended", summary: { questionsRun, itemCount: state.itemCount, joined } };
  }
  const place = placeOf(state, input);
  const on: OnItem = { code, place, tally: { answered: input.answered, joined } };
  if (state.status === "paused") return { ...on, phase: "paused", timer: state.timer };
  if (state.reveal) return { ...on, phase: "answerShowing" };
  if (place.caseStep !== null) {
    return { ...on, phase: "caseStep", timer: state.timer, caseStep: place.caseStep };
  }
  return { ...on, phase: "question", timer: state.timer };
}

/** The teacher's console: the stage's phase, plus names, connection and the buttons on offer. */
export function controlView(input: HostViewInput): ControlView {
  return {
    ...stageView(input),
    commands: controlCommands(input.state),
    connection: input.connection,
    names: [...input.names],
    studentPaced: isStudentPaced(input.state),
  };
}

/** A phone's own answer to an item, as the transport reports it. */
export interface OwnAnswer {
  itemId: string;
  /** Epoch ms on the session's clock. */
  submittedAt: number;
}

export interface PhoneViewInput {
  state: LiveSessionState;
  /** The item the room is on, keyless as a participant's channel carries it. */
  item: ParticipantItem | null;
  /** This phone's own answer to the item the room is on, if it has given one. */
  answered: OwnAnswer | null;
  /** The reveal the transport delivered, if any. Shown only when it is for the item on screen. */
  revealed: ItemReveal | null;
  connection: LiveConnection;
  /** The server will not let this phone back in: its participant is gone or the session closed. */
  refused: boolean;
  /** How many have joined, for the waiting screen. */
  joined: number;
  /** The session's clock now, for "Time is up". Never `Date.now()` on a phone. */
  now: number;
}

interface PhoneOnItem {
  place: RoomPlace;
  item: ParticipantItem | null;
}

/** Every phone state but the two that sit over another (`reconnecting`) or end it (`refused`). */
export type PhoneSettledView =
  | { phase: "waiting"; headline: string; joined: number }
  | (PhoneOnItem & { phase: "answering"; timer: ItemTimer; studentPaced: boolean })
  | (PhoneOnItem & { phase: "answerSent"; timer: ItemTimer; submittedAt: number })
  | (PhoneOnItem & { phase: "timeUp" })
  | (PhoneOnItem & { phase: "answerShowing"; revealed: ItemReveal | null; answered: boolean })
  | (PhoneOnItem & { phase: "paused"; headline: string; answered: boolean })
  | { phase: "ended"; headline: string };

export type PhoneView =
  /** The question stays on screen with Submit held off and the draft kept (PLAN §5.7). */
  { phase: "reconnecting"; underneath: PhoneSettledView } | { phase: "refused" } | PhoneSettledView;

export type PhonePhase = PhoneView["phase"];

/** The fields that carry an answer (ADR 0003), removed even from an item that should not have them. */
function keyless(item: ParticipantItem | null): ParticipantItem | null {
  if (item === null) return null;
  const copy = { ...(item as Record<string, unknown>) };
  delete copy.answerKey;
  delete copy.rationale;
  delete copy.scoring;
  return copy as ParticipantItem;
}

function settledPhone(input: PhoneViewInput): PhoneSettledView {
  const { state } = input;
  const copy = waitingCopy(state);
  if (state.status === "ended") return { phase: "ended", headline: copy.headline };
  if (state.status === "lobby") {
    return { phase: "waiting", headline: copy.headline, joined: input.joined };
  }
  const paced = isStudentPaced(state);
  // A student-paced room carries its whole set instead (`set` on the view); none of it is here.
  const item = paced ? null : keyless(input.item);
  const on: PhoneOnItem = { place: placeOf(state), item };
  const answered = item !== null && input.answered !== null && input.answered.itemId === item.id;
  if (state.status === "paused")
    return { ...on, phase: "paused", headline: copy.headline, answered };
  if (state.reveal) {
    const revealed = input.revealed;
    const forThisItem =
      revealed !== null &&
      !paced &&
      revealed.position === state.position &&
      (item === null || revealed.itemId === item.id);
    return { ...on, phase: "answerShowing", revealed: forThisItem ? revealed : null, answered };
  }
  if (paced) return { ...on, phase: "answering", timer: state.timer, studentPaced: true };
  if (answered) {
    return {
      ...on,
      phase: "answerSent",
      timer: state.timer,
      submittedAt: (input.answered as OwnAnswer).submittedAt,
    };
  }
  if (state.timer.remainingMs === null && remainingMs(state.timer, input.now) === 0) {
    return { ...on, phase: "timeUp" };
  }
  return { ...on, phase: "answering", timer: state.timer, studentPaced: false };
}

/** A student's phone. See the file comment on keys. */
export function phoneView(input: PhoneViewInput): PhoneView {
  if (input.refused) return { phase: "refused" };
  const settled = settledPhone(input);
  // An ended session's channel closes; that is not a connection problem worth a banner.
  if (input.connection !== "connected" && settled.phase !== "ended") {
    return { phase: "reconnecting", underneath: settled };
  }
  return settled;
}
