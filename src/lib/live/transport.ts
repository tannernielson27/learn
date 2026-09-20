/**
 * `LiveSessionTransport` — the one seam every live-session screen talks through (ADR 0002).
 *
 * **No Supabase types appear here, and none may.** ADR 0002's Consequences say the interface must
 * not leak them and that the PR introducing it has to say so; the review is in that PR's body. The
 * whole file imports from `@/lib/ngn` and from this folder, nothing else. Swapping Supabase
 * Realtime for PartyKit, Ably or Convex is then one new file implementing these methods — no UI,
 * store or test changes anywhere. Ids are `string`, times are epoch milliseconds, and nothing here
 * knows what a channel, a row or a `postgres_changes` payload is.
 *
 * Two interfaces, not one. The architecture sketch (02-ARCHITECTURE §4) marks `advance/reveal/
 * pause/end` and `onAggregate` "host only"; splitting them makes that a type rule rather than a
 * comment, so a student's page cannot be handed something that can reveal a key or read the room's
 * tallies. Everything a participant can reach is on `LiveSessionTransport`.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { AnyResponse, Item } from "@/lib/ngn/schemas";
import type { KeylessItem, PlayableItem, Reveal, ScoreReveal } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";
import type { LiveSessionState, SessionMode } from "./state";

/** Drops a subscription. Calling it twice is harmless. */
export type Unsubscribe = () => void;

/** Who is joining. `profileId` is null for a guest who typed a name on the join page. */
export interface ParticipantIdentity {
  displayName: string;
  profileId?: string | null;
}

/** One person in the room, as everyone else may see them: a name and nothing else. */
export interface Participant {
  participantId: string;
  displayName: string;
  /** Epoch milliseconds. */
  joinedAt: number;
}

/**
 * What the room is on, as one side sees it. Generic in the item, which is the point: a participant
 * channel is typed `SessionView<KeylessItem>` and so cannot carry an answer key at all, while the
 * host's is `SessionView<Item>` because the host is the one who reveals it (ADR 0003).
 *
 * The sketch's `onSessionState` comment reads "status, current item, timer, reveal flag"; status,
 * reveal and the timer live on `state`, and the current item is here beside it.
 */
export interface SessionView<T extends PlayableItem = KeylessItem> {
  state: LiveSessionState;
  /** The item the room is on. Null in the lobby and once the session has ended. */
  item: T | null;
}

/** What `join` answers with: the view, plus the facts about the session that never change. */
export interface ParticipantSnapshot extends SessionView<KeylessItem> {
  sessionId: string;
  code: string;
  mode: SessionMode;
  /** This participant's own id, which every later call is made as. */
  participantId: string;
  roster: Participant[];
}

/** What `open` answers the host with. The host may hold keys and may read the tallies. */
export interface HostSnapshot extends SessionView<Item> {
  sessionId: string;
  code: string;
  mode: SessionMode;
  roster: Participant[];
  aggregate: ItemAggregate | null;
}

/** All `submit` promises: the answer was taken, at this time. No score, and no key (ADR 0003). */
export interface SubmitAck {
  itemId: string;
  /** Epoch milliseconds, from the session's clock rather than the participant's. */
  submittedAt: number;
}

/**
 * What arrives when the host reveals an item: the key, the rationale and the scoring rule, and —
 * only for a participant who answered — their own marks. Nothing here exists before the reveal.
 *
 * When `score` is not null, `{ ...reveal, score }` is exactly the `ScoreReveal` that `ItemPlayer`
 * takes as `initialReveal` (#56, #46), so a session screen hands it straight over; a participant
 * who did not answer still gets the key, because the class is discussing it.
 */
export interface ItemReveal {
  itemId: string;
  /** One-based, like `LiveSessionState.position`. */
  position: number;
  reveal: Reveal;
  score: ScoreResult | null;
}

/** `{ ...reveal, score }` where there is a score: the shape the submit seam already speaks. */
export function toScoreReveal(revealed: ItemReveal): ScoreReveal | null {
  return revealed.score === null ? null : { ...revealed.reveal, score: revealed.score };
}

/**
 * One item's results, for the host's dashboard.
 *
 * ADR 0002: **pushed once per item change, never once per submission.** Nothing here can be turned
 * back into an answer key — it counts how the marks fell, not which option anyone chose — but it is
 * still host-only, because "how many got it right" told to the room before the reveal is a hint.
 */
export interface ItemAggregate {
  itemId: string;
  /** One-based, like `LiveSessionState.position`. */
  position: number;
  /** How many people were in the room when this was counted. */
  present: number;
  responded: number;
  fullMarks: number;
  partialMarks: number;
  noMarks: number;
  /** Mean points over the answers received, to two decimals; 0 when there are none. */
  meanPoints: number;
  maxPoints: number;
}

/**
 * A participant's connection. Everything a student's page is ever given.
 *
 * Nothing on it can reveal a key, move the room or read the tallies. `onReveal` delivers a key only
 * after the host has revealed that item, which is ADR 0003's rule expressed as an API.
 */
export interface LiveSessionTransport {
  /** Joins by the code the host read out. Rejects `LiveSessionError` when it names no open room. */
  join(code: string, identity: ParticipantIdentity): Promise<ParticipantSnapshot>;
  /** Leaves the room. Idempotent, so a component's cleanup can call it without checking. */
  leave(): Promise<void>;
  onSessionState(listener: (view: SessionView<KeylessItem>) => void): Unsubscribe;
  onPresence(listener: (roster: Participant[]) => void): Unsubscribe;
  /** Fires once per item the host reveals, carrying this participant's own marks. */
  onReveal(listener: (revealed: ItemReveal) => void): Unsubscribe;
  /**
   * Answers the item the room is on. Rejects `LiveSessionError` when the state machine refuses —
   * the session ended, it is paused, the room moved on, the key is already showing, or this
   * participant has answered this item once already.
   */
  submit(itemId: string, response: AnyResponse): Promise<SubmitAck>;
}

/**
 * The host's connection. Holds the keys, moves the room, reads the tallies.
 *
 * Deliberately **not** an extension of `LiveSessionTransport`: a host does not join by code and
 * does not submit, so inheriting those would be a lie, and keeping them apart means a student page
 * cannot be given one by accident.
 */
export interface LiveHostTransport {
  /** Opens the console on a session the caller already hosts. */
  open(): Promise<HostSnapshot>;
  /** Closes the console. Does not end the session; only `end()` does that. Idempotent. */
  close(): Promise<void>;
  onSessionState(listener: (view: SessionView<Item>) => void): Unsubscribe;
  onPresence(listener: (roster: Participant[]) => void): Unsubscribe;
  onAggregate(listener: (aggregate: ItemAggregate) => void): Unsubscribe;
  /** Each rejects `LiveSessionError` when the state machine refuses the move. */
  start(): Promise<LiveSessionState>;
  advance(): Promise<LiveSessionState>;
  reveal(): Promise<LiveSessionState>;
  pause(): Promise<LiveSessionState>;
  resume(): Promise<LiveSessionState>;
  end(): Promise<LiveSessionState>;
}
