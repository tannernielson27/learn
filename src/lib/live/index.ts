/**
 * `src/lib/live` — the live-session transport seam (ADR 0002).
 *
 * The rule here is the rule on `src/lib/ngn`: **pure TypeScript, no React, no Next, no Supabase.**
 * ADR 0002 says the interface must not leak Supabase types; keeping the whole folder free of the
 * dependency is how that is kept true rather than remembered. Adapters live beside this one —
 * `memoryRoom.ts` today, a Supabase adapter in #131 — and the UI imports only from here.
 */
export { LIVE_REFUSALS, LiveSessionError, isLiveSessionError, type LiveRefusal } from "./errors";
export {
  HOST_COMMANDS,
  SESSION_MODES,
  SESSION_STATUSES,
  TIMER_COMMANDS,
  applyHostCommand,
  canRunHostCommand,
  canSubmit,
  chooseTimer,
  initialSessionState,
  itemAt,
  type GuardResult,
  type HostCommand,
  type TimerCommand,
  type LiveSessionState,
  type SessionMode,
  type SessionStatus,
  type TransitionResult,
} from "./state";
export {
  toScoreReveal,
  type HostSnapshot,
  type ItemAggregate,
  type ItemReveal,
  type LiveHostTransport,
  type LiveSessionTransport,
  type Participant,
  type ParticipantIdentity,
  type ParticipantItem,
  type ParticipantSnapshot,
  type SessionView,
  type SubmitAck,
  type Unsubscribe,
} from "./transport";
export {
  NO_TIMER,
  SUBMIT_GRACE_MS,
  TIMER_CHOICES,
  TIMER_EXTEND_MS,
  clockOffset,
  formatClock,
  hasClock,
  readTimer,
  remainingMs,
  timerAnnouncement,
  type ItemTimer,
  type TimerChoice,
} from "./timer";
export { countPresent, mergeRoster, type RosterEntry } from "./roster";
export { waitingCopy, type WaitingCopy } from "./waiting";
export { createInMemoryRoom, type InMemoryRoom, type InMemoryRoomOptions } from "./memoryRoom";
export {
  answerAll,
  joinSimulated,
  type AnsweringRound,
  type JoinableRoom,
  type SimulatedParticipant,
} from "./simulate";
export {
  COMMON_WRONG_LIMIT,
  concealKey,
  distributionFor,
  percentOf,
  shareOf,
  type BlankCounts,
  type BlanksDistribution,
  type ChoiceCount,
  type CombinationPick,
  type Distribution,
  type DistributionKind,
  type GridDistribution,
  type GridRow,
  type OptionsDistribution,
  type OrderDistribution,
  type PairsDistribution,
  type PositionCounts,
  type SlotCounts,
  type SlotsDistribution,
  type WrongCombination,
} from "./results";
