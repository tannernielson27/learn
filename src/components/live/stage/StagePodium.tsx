"use client";

import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/components/question/usePrefersReducedMotion";
import { podiumGroups, type Podium, type PodiumGroup } from "@/lib/live/podium";
import type { EndSummary } from "@/lib/live/views";
import { endTiles } from "./StageEnded";

export interface StagePodiumProps {
  title: string;
  podium: Podium;
  summary: EndSummary;
  /** Of every answer the class could have sent, the share it did; null when not known. */
  rate: number | null;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"] as const;
const ordinal = (place: number): string => ORDINALS[place - 1] ?? `${place}th`;
const placeWords = (group: PodiumGroup): string =>
  group.tied ? `${ordinal(group.place)}, tied` : ordinal(group.place);
const pointsWords = (points: number): string => `${points} ${points === 1 ? "point" : "points"}`;

/** Where each of the first three places stands (places 4 and 5 are never on a block): the best in the middle, then left, then right. */
const COLUMNS = ["col-start-2", "col-start-1", "col-start-3"] as const;
/** How tall each block is, on a 1080px stage: 1st tallest. Blocks give way first when crowded. */
const HEIGHTS = ["h-[26cqb]", "h-[19cqb]", "h-[14cqb]"] as const;

/**
 * The top 5 on the projector when a live session ends (owner request, 2026-10-24): a podium for
 * the first three places, 1st in the middle and tallest, 2nd on the left, 3rd on the right, with
 * 4th and 5th as a short list beneath and the session's numbers along the bottom.
 *
 * Places arrive from the bottom up, 5th first and 1st last, each rising and fading in a little
 * over half a second after the one before (`.motion-podium`, transform and opacity only). Under
 * reduced motion everything is there at once and nothing moves. The stage has no controls, so the
 * reveal can hold nothing up.
 *
 * In the DOM the places run best first, so a screen reader reads them in order; CSS places them.
 * Names are React text, never markup.
 */
export function StagePodium({ title, podium, summary, rate }: StagePodiumProps) {
  const still = usePrefersReducedMotion();
  const groups = podiumGroups(podium.entries);
  const last = groups.at(-1);
  const motion = (step: number): { className: string; style?: CSSProperties } =>
    still
      ? { className: "" }
      : { className: "motion-podium", style: { "--podium-step": String(step) } as CSSProperties };

  return (
    <div className="flex h-full min-h-0 flex-col gap-[2.6cqb]">
      <header className="flex items-end justify-between gap-[4cqb]">
        <h1 className="font-read text-stage-stem leading-tight">Top 5</h1>
        <div className="flex min-w-0 flex-col items-end gap-[0.6cqb] text-stage-label">
          <p className="font-semibold text-ink-2">Live session ended</p>
          <p className="max-w-full truncate font-read">{title}</p>
        </div>
      </header>

      <ol
        aria-label="Top 5"
        className="grid min-h-0 flex-1 grid-cols-3 grid-rows-[minmax(0,1fr)] gap-x-[3cqb] overflow-hidden"
      >
        {groups.map((group, index) => {
          const { className, style } = motion(group.step);
          if (index < 3 && group.place <= 3) {
            const crowded = group.entries.length > 3;
            return (
              <li
                key={group.place}
                data-place={group.place}
                style={style}
                className={`${COLUMNS[index]} row-start-1 flex min-h-0 flex-col justify-end ${className}`}
              >
                <div
                  className={`order-last flex ${HEIGHTS[index]} min-h-[9cqb] shrink flex-col items-center justify-center gap-[0.6cqb] border-t-(length:--stage-stroke) ${
                    index === 0 ? "border-accent bg-accent-soft" : "border-stage-ink bg-surface-2"
                  }`}
                >
                  <p className="font-mono text-stage-number leading-none font-bold">
                    {ordinal(group.place)}
                  </p>
                  {group.tied ? (
                    <p className="text-stage-label font-semibold">
                      <span className="sr-only">, </span>tied
                    </p>
                  ) : null}
                </div>
                <div
                  className={`grid shrink-0 gap-x-[2cqb] gap-y-[0.6cqb] pb-[1.6cqb] text-center ${
                    crowded ? "grid-cols-2 text-stage-label" : "grid-cols-1 text-stage-option"
                  }`}
                >
                  {group.entries.map((entry, at) => (
                    <p
                      // Two people may share a name and a place; the order is theirs alone.
                      key={`${at}:${entry.displayName}`}
                      data-testid="podium-name"
                      title={entry.displayName}
                      className={`leading-tight font-semibold ${
                        crowded ? "truncate" : "line-clamp-2 [overflow-wrap:anywhere]"
                      }`}
                    >
                      {entry.displayName}
                    </p>
                  ))}
                  <p
                    className={`font-mono text-stage-label text-ink-2 tabular ${crowded ? "col-span-2" : ""}`}
                  >
                    {pointsWords(group.entries[0]?.points ?? 0)}
                  </p>
                </div>
              </li>
            );
          }
          return (
            <li
              key={group.place}
              data-place={group.place}
              style={style}
              className={`col-span-3 flex items-baseline gap-x-[3cqb] border-t-(length:--stage-stroke) border-stage-line pt-[1.2cqb] text-stage-label ${className}`}
            >
              <p className="min-w-[16cqb] shrink-0 font-mono font-bold">{placeWords(group)}</p>
              <p className="flex min-w-0 flex-1 flex-wrap gap-x-[3cqb]">
                {group.entries.map((entry, at) => (
                  <span
                    key={`${at}:${entry.displayName}`}
                    data-testid="podium-name"
                    title={entry.displayName}
                    className="max-w-full truncate font-semibold"
                  >
                    {entry.displayName}
                  </span>
                ))}
              </p>
              <p className="shrink-0 font-mono text-ink-2 tabular">
                {pointsWords(group.entries[0]?.points ?? 0)}
              </p>
            </li>
          );
        })}
      </ol>

      {podium.more > 0 && last !== undefined ? (
        <p
          style={motion(last.step).style}
          className={`text-stage-label font-semibold text-ink-2 ${motion(last.step).className}`}
        >
          and {podium.more} more
        </p>
      ) : null}

      <dl
        data-testid="podium-summary"
        className="flex flex-wrap gap-x-[5cqb] gap-y-[1cqb] border-t-(length:--stage-stroke) border-stage-ink pt-[1.6cqb] text-stage-label"
      >
        {endTiles(summary, rate).map(([value, words]) => (
          <div key={words} className="flex flex-row-reverse items-baseline gap-[1cqb]">
            <dt className="font-semibold text-ink-2">{words}</dt>
            <dd className="font-mono font-bold tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
