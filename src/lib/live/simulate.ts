/**
 * Simulated participants for the in-memory room (#130).
 *
 * Two small helpers so the gallery's fake room and the load script docs/03 §4 asks for ("60
 * simulated participants against the in-memory transport") say what they mean in a line each
 * instead of repeating the same loop. They go through the ordinary participant transport, keys
 * included: a simulated student is refused exactly what a real one would be.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { AnyResponse } from "@/lib/ngn/schemas";
import { isLiveSessionError, type LiveRefusal } from "./errors";
import type { InMemoryRoom } from "./memoryRoom";
import type { LiveSessionTransport } from "./transport";

export interface SimulatedParticipant {
  readonly transport: LiveSessionTransport;
  readonly displayName: string;
  readonly participantId: string;
}

/** What one round of answering produced. Refusals are counted, never thrown away silently. */
export interface AnsweringRound {
  submitted: number;
  /** Refusals by code, e.g. `already_answered` when a round is run twice. */
  refused: Partial<Record<LiveRefusal, number>>;
}

/** Joins one participant per name, in order, and hands back their connections. */
export async function joinSimulated(
  room: InMemoryRoom,
  names: readonly string[],
): Promise<SimulatedParticipant[]> {
  const joined: SimulatedParticipant[] = [];
  for (const displayName of names) {
    const transport = room.participant();
    const snapshot = await transport.join(room.code, { displayName });
    joined.push({ transport, displayName, participantId: snapshot.participantId });
  }
  return joined;
}

/**
 * Has each participant answer `itemId` with whatever `respond` returns for them; returning null
 * leaves that one unanswered, which is how a room with stragglers is simulated.
 *
 * Refusals from the state machine are counted rather than thrown, because a simulation is allowed
 * to run into a paused or revealed item and should report it, not crash the page.
 */
export async function answerAll(
  participants: readonly SimulatedParticipant[],
  itemId: string,
  respond: (context: { itemId: string; index: number }) => AnyResponse | null,
): Promise<AnsweringRound> {
  const round: AnsweringRound = { submitted: 0, refused: {} };
  for (const [index, participant] of participants.entries()) {
    const response = respond({ itemId, index });
    if (response === null) continue;
    try {
      await participant.transport.submit(itemId, response);
      round.submitted += 1;
    } catch (error) {
      if (!isLiveSessionError(error)) throw error;
      round.refused[error.code] = (round.refused[error.code] ?? 0) + 1;
    }
  }
  return round;
}
