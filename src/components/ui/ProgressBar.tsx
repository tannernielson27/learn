interface ProgressBarBase {
  value: number;
  max: number;
  /** `md` is 6px, `lg` 8px (a console card). */
  size?: "md" | "lg";
  className?: string;
}

interface AnnouncedProgressBar extends ProgressBarBase {
  decorative?: false;
  /** What is progressing, for a screen reader: "Questions answered". */
  label: string;
  /** Read instead of the bare numbers: "18 of 24 answered". Defaults to "value of max". */
  valueText?: string;
}

/**
 * Beside a count that already says it in words ("4 of 9 answered"), the bar is drawn only and
 * hidden from assistive tech, so a screen reader hears the count once, not twice (#563).
 */
interface DecorativeProgressBar extends ProgressBarBase {
  decorative: true;
  label?: never;
  valueText?: never;
}

export type ProgressBarProps = AnnouncedProgressBar | DecorativeProgressBar;

/**
 * One progress bar for the product (PLAN D12, in place of four). A neutral track and an accent
 * fill that grows by `scaleX`, the only property motion here may use; reduced motion drops the
 * transition through the duration tokens.
 */
export function ProgressBar({
  value,
  max,
  label,
  valueText,
  decorative = false,
  size = "md",
  className = "",
}: ProgressBarProps) {
  const top = Math.max(0, max);
  const now = Math.min(Math.max(0, value), top);
  const share = top === 0 ? 0 : now / top;
  return (
    <div
      {...(decorative
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": top,
            "aria-valuenow": now,
            "aria-valuetext": valueText ?? `${now} of ${top}`,
          })}
      className={`${size === "lg" ? "h-2" : "h-1.5"} overflow-hidden rounded-full bg-surface-2 ${className}`.trim()}
    >
      <div
        data-testid="progress-fill"
        className="h-full origin-left rounded-full bg-accent transition-transform duration-slow ease-out-expo"
        style={{ transform: `scaleX(${share})` }}
      />
    </div>
  );
}
