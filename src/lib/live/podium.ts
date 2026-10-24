import { z } from "zod";
import type { SessionReport } from "./report";

/**
 * The top 5 on the projector when a live session ends: who they are, their place, and their points.
 *
 * The points are the teacher's report's own totals (`buildSessionReport`), so the podium and the
 * report can never disagree: each answer's stored score summed, where +/- scoring has already
 * floored every question at zero. No speed bonus and no tiebreak of any kind.
 *
 * Standard competition ranking (1, 1, 3, 4, 5): equal totals share a place and the next place is
 * skipped. Everyone whose place is 5 or better is shown, alphabetically inside a tie, up to
 * `PODIUM_MAX_NAMES`; the rest of a large tie are counted, not named. Nobody with no points stands
 * on the podium, so a session where nobody scored has none.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */

/** The lowest place shown. */
export const PODIUM_PLACES = 5;
/** The most names on screen; a tie that would go past it ends in "and N more". */
export const PODIUM_MAX_NAMES = 8;

export interface PodiumScore {
  participantId: string;
  displayName: string;
  points: number;
}

export interface PodiumEntry {
  /** Exactly as the student typed it. Rendered as text, never as markup. */
  displayName: string;
  points: number;
  /** 1 to 5. */
  place: number;
  /** Whether someone else shares this place. */
  tied: boolean;
}

export interface Podium {
  /** By place, then alphabetically; at most `PODIUM_MAX_NAMES`, never empty. */
  entries: PodiumEntry[];
  /** How many more share a shown place than fit on screen. */
  more: number;
}

/** Totals compared in hundredths: `numeric(8, 2)` points, summed in floating point. */
const hundredths = (points: number): number => Math.round(points * 100);

/** Alphabetical, ignoring case; the same name twice goes by id, so the order is stable. */
function byName(a: PodiumScore, b: PodiumScore): number {
  return (
    a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }) ||
    (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0) ||
    a.participantId.localeCompare(b.participantId)
  );
}

export function rankPodium(scores: readonly PodiumScore[]): Podium | null {
  const scored = scores
    .filter((each) => hundredths(each.points) > 0)
    .sort((a, b) => hundredths(b.points) - hundredths(a.points) || byName(a, b));

  const ranked: PodiumEntry[] = [];
  scored.forEach((each, index) => {
    const previous = ranked[index - 1];
    const same = previous !== undefined && hundredths(previous.points) === hundredths(each.points);
    const place = same ? previous.place : index + 1;
    if (place > PODIUM_PLACES) return;
    if (same) previous.tied = true;
    ranked.push({
      displayName: each.displayName,
      points: hundredths(each.points) / 100,
      place,
      tied: same,
    });
  });

  if (ranked.length === 0) return null;
  return {
    entries: ranked.slice(0, PODIUM_MAX_NAMES),
    more: Math.max(0, ranked.length - PODIUM_MAX_NAMES),
  };
}

/**
 * The podium for a session from its report. Null when no question was worth anything or nobody
 * earned a point, where the stage keeps its summary instead.
 */
export function podiumOfReport(report: SessionReport): Podium | null {
  const possible = report.students[0]?.possible ?? 0;
  if (possible <= 0) return null;
  return rankPodium(
    report.students.map((row) => ({
      participantId: row.participantId,
      displayName: row.displayName,
      points: row.points,
    })),
  );
}

export interface PodiumGroup {
  place: number;
  tied: boolean;
  entries: PodiumEntry[];
  /** When it arrives, counting from 0: the lowest place first, 1st last. */
  step: number;
}

/** The entries by shared place, best first, each with its turn in the bottom-up reveal. */
export function podiumGroups(entries: readonly PodiumEntry[]): PodiumGroup[] {
  const groups: Omit<PodiumGroup, "step">[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last !== undefined && last.place === entry.place) {
      last.entries.push(entry);
      last.tied = true;
    } else {
      groups.push({ place: entry.place, tied: entry.tied, entries: [entry] });
    }
  }
  return groups.map((group, index) => ({ ...group, step: groups.length - 1 - index }));
}

const podiumSchema = z.object({
  entries: z
    .array(
      z.object({
        displayName: z.string(),
        points: z.number().finite(),
        place: z.number().int().min(1).max(PODIUM_PLACES),
        tied: z.boolean(),
      }),
    )
    .min(1)
    .max(PODIUM_MAX_NAMES),
  more: z.number().int().min(0),
});

/** The body of the podium route, checked; anything unexpected reads as no podium. */
export function parsePodium(body: unknown): Podium | null {
  const parsed = z.object({ podium: podiumSchema.nullable() }).safeParse(body);
  return parsed.success ? parsed.data.podium : null;
}
