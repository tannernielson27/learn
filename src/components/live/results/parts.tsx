import type { ReactNode } from "react";
import { percentOf, shareOf, type ChoiceCount } from "@/lib/live/results";

/**
 * The pieces every results view is built from (#180): a count said in words, a bar, the mark on a
 * correct choice, and a heading for a group of choices.
 *
 * Everything a bar or a shaded cell says is also said as text beside it — "3 of 5 · 60%" — so the
 * picture is never the only way to read a number, and a correct choice is marked with a word and
 * an icon, never by colour alone (docs/04 §8). Bars grow with `transform: scaleX` and nothing else;
 * reduced motion drops the transition.
 */

/** "3 of 5 · 60%", the sentence under every bar and in every cell. */
export function shareText(count: number, total: number): string {
  return `${count} of ${total} · ${percentOf(count, total)}%`;
}

/**
 * The mark on a correct choice once the answer is showing: an icon and the word, in green. On a
 * solid surface of its own, so it keeps its contrast on a shaded heat-map cell too.
 */
export function CorrectMark() {
  return (
    <span
      data-testid="result-correct"
      className="ml-2 inline-flex items-center gap-1 rounded-sm bg-surface-1 px-1 align-baseline text-sm font-medium text-correct"
    >
      <span aria-hidden="true" className="font-mono">
        ✓
      </span>
      Correct
    </span>
  );
}

/** A horizontal bar `share` of the way across. Decorative: the text beside it says the number. */
export function Bar({ share, correct }: { share: number; correct: boolean }) {
  return (
    <div aria-hidden="true" className="mt-1 h-2.5 overflow-hidden rounded-sm bg-surface-2">
      <div
        data-share={share.toFixed(2)}
        className={`h-full w-full origin-left transition-transform duration-base ease-out-expo motion-reduce:transition-none ${
          correct ? "bg-correct" : "bg-ink-2"
        }`}
        style={{ transform: `scaleX(${share})` }}
      />
    </div>
  );
}

export interface ChoiceBarsProps {
  /** What the list is of, for a screen reader: "Options", "Blank 1". */
  label: string;
  choices: readonly ChoiceCount[];
  /** How many answers the percentages are of. */
  total: number;
  revealed: boolean;
}

/** One row per choice: its label, its count as text, and a bar. A list, so it reads as one. */
export function ChoiceBars({ label, choices, total, revealed }: ChoiceBarsProps) {
  return (
    <ul aria-label={label} className="space-y-3">
      {choices.map((choice) => {
        const marked = revealed && choice.correct;
        return (
          <li key={choice.id} data-testid="result-choice">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-base break-words text-ink-1 lg:text-lg">
                {choice.label}
                {marked ? <CorrectMark /> : null}
              </span>
              <span className="tabular text-base whitespace-nowrap text-ink-1 lg:text-lg">
                {shareText(choice.count, total)}
              </span>
            </div>
            <Bar share={shareOf(choice.count, total)} correct={marked} />
          </li>
        );
      })}
    </ul>
  );
}

/** A named group of results: a blank, a bowtie slot, a matrix row on its own. */
export function ResultGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-medium tracking-wide text-ink-2 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** "2 left it blank", "1 could not be read": said only when it is not nought. */
export function Footnotes({ lines }: { lines: readonly (string | null)[] }) {
  const said = lines.filter((line): line is string => line !== null);
  if (said.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-ink-2">
      {said.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** "2 left it blank", or null when nobody did. */
export const blankLine = (count: number, what = "left it blank"): string | null =>
  count > 0 ? `${count} ${what}` : null;

/**
 * A shaded cell's background: the share of the room, as the opacity of a neutral ink layer.
 * Capped well short of solid so the text on it keeps its contrast in both themes.
 */
export const HEAT_MAX_OPACITY = 0.32;

export function HeatLayer({ share }: { share: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-ink-2 transition-opacity duration-base motion-reduce:transition-none"
      style={{ opacity: share * HEAT_MAX_OPACITY }}
    />
  );
}
