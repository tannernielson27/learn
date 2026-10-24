import { Check } from "lucide-react";
import { Icon } from "./Icon";

export interface ResultsChartRow {
  /**
   * "A", "B", ... in the order every screen shows the options (PLAN §5.5). Left out for select
   * all that apply, whose options have no letters on any screen.
   */
  letter?: string;
  label: string;
  count: number;
  /** Marked only once the answer is showing; a chart before the reveal has no key row. */
  isKey?: boolean;
}

export interface ResultsChartProps {
  rows: readonly ResultsChartRow[];
  /** What the shares are out of: the answers received, so the rows can sum to 100%. */
  total: number;
  /** `app` for the console and reports; `stage` for the projector. */
  size?: "app" | "stage";
  /** What the chart is, for a screen reader: "How the class answered". */
  label?: string;
  className?: string;
}

/** A whole percent, 0 when there is nothing to share out. */
export function sharePercent(count: number, total: number): number {
  return total <= 0 ? 0 : Math.round((count / total) * 100);
}

const SIZES = {
  app: {
    gap: "gap-3.5",
    letter: "size-8 border-2 text-sm",
    label: "text-base",
    bar: "h-3.5",
    count: "min-w-24 text-base",
    keyWord: "text-sm",
  },
  stage: {
    gap: "gap-[2.5cqb]",
    letter: "size-[6.5cqb] border-(length:--stage-stroke) text-stage-label",
    label: "text-stage-option",
    bar: "h-[3.7cqb]",
    count: "min-w-[7ch] text-stage-label",
    keyWord: "text-stage-label",
  },
} as const;

/**
 * How the room answered, one row per option: the letter, the option's words, a bar and
 * "13 · 59%" (PLAN §4, D8). One neutral hue for every bar. The key is marked three ways at once,
 * so no one needs to tell green from grey: a `--chart-key` fill, a 3px outline, and a check with
 * the word "Correct". There is no red row, so red and green never sit side by side.
 *
 * Bars grow once with `scaleX` from the left over 320ms (reduced motion: the token duration).
 * Nothing counts up.
 */
export function ResultsChart({
  rows,
  total,
  size = "app",
  label = "How the class answered",
  className = "",
}: ResultsChartProps) {
  const look = SIZES[size];
  return (
    <ul aria-label={label} className={`grid ${look.gap} ${className}`.trim()}>
      {rows.map((row, index) => {
        const percent = sharePercent(row.count, total);
        const key = row.isKey === true;
        return (
          <li
            key={row.letter ?? index}
            data-key={key ? "" : undefined}
            className={`grid ${row.letter === undefined ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]"} items-center gap-x-4`}
          >
            {row.letter === undefined ? null : (
              <span
                aria-hidden="true"
                className={`grid place-items-center rounded-full font-mono font-bold ${look.letter} ${key ? "border-chart-key bg-chart-key text-accent-contrast" : "border-field-border"}`}
              >
                {row.letter}
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className={`${look.label} flex flex-wrap items-baseline gap-x-3`}>
                {row.letter === undefined ? null : <span className="sr-only">{row.letter}. </span>}
                {row.label}
                {key ? (
                  <span
                    className={`${look.keyWord} inline-flex items-center gap-1 font-bold text-correct`}
                  >
                    <Icon icon={Check} size={size === "stage" ? "stage" : "app"} />
                    Correct
                  </span>
                ) : null}
              </span>
              <div
                aria-hidden="true"
                className={`${look.bar} relative overflow-hidden rounded-sm bg-chart-track ${key ? "outline-(length:--chart-key-outline) outline-offset-2 outline-chart-key outline-solid" : ""}`}
              >
                <span
                  data-testid="results-bar"
                  className={`motion-grow absolute inset-0 origin-left ${key ? "bg-chart-key" : "bg-chart-bar"}`}
                  style={{ transform: `scaleX(${percent / 100})` }}
                />
              </div>
            </div>
            <span className={`${look.count} text-right font-mono font-semibold tabular`}>
              {row.count} · {percent}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
