import type { ReactNode } from "react";
import type { RichText } from "@/lib/ngn/schemas";
import { ElementRationale } from "./ElementRationale";
import type { ElementFeedback, PlayerMode } from "./types";

export interface OptionRowProps {
  id: string;
  name: string;
  kind: "radio" | "checkbox";
  label: ReactNode;
  /** Optional leading marker, e.g. the option letter for traditional multiple choice. */
  marker?: string;
  checked: boolean;
  disabled?: boolean;
  feedback: ElementFeedback;
  mode: PlayerMode;
  /** Why this option was right or wrong. Present in feedback mode only. */
  rationale?: RichText;
  onToggle: () => void;
}

const feedbackClasses: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "border-l-4 border-l-correct bg-correct-soft",
  incorrect: "border-l-4 border-l-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

export const feedbackLabel: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "Correct",
  incorrect: "Incorrect",
  missed: "Missed",
};

export function FeedbackIcon({
  state,
  className = "ml-auto",
}: {
  state: ElementFeedback;
  className?: string;
}) {
  if (state === "neutral") return null;
  const isCorrect = state === "correct" || state === "missed";
  return (
    <span
      aria-hidden="true"
      data-feedback-mark=""
      className={`${className} shrink-0 font-mono text-xs ${isCorrect ? "text-correct" : "text-incorrect"}`}
    >
      {isCorrect ? "✓" : "✕"}
    </span>
  );
}

/**
 * A single selectable option. The whole row is the label, so the tap target is the full width.
 * Selection and feedback treatments follow docs/04-DESIGN-DIRECTION.md §4.
 */
export function OptionRow({
  id,
  name,
  kind,
  label,
  marker,
  checked,
  disabled = false,
  feedback,
  mode,
  rationale,
  onToggle,
}: OptionRowProps) {
  const interactive = mode === "answer" && !disabled;
  const rationaleId = `${id}-rationale`;
  const selectedClasses =
    checked && mode !== "feedback" ? "border-accent ring-1 ring-accent bg-accent-soft" : "";
  return (
    <div>
      <label
        htmlFor={id}
        className={`option flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line bg-surface-1 px-4 py-3 transition-[background-color,border-color,box-shadow] duration-fast ease-out-expo ${
          interactive ? "hover:bg-surface-2" : "cursor-default"
        } ${selectedClasses} ${feedbackClasses[feedback]} ${disabled && !checked ? "opacity-50" : ""}`}
      >
        <input
          id={id}
          name={name}
          type={kind}
          checked={checked}
          disabled={!interactive}
          onChange={onToggle}
          aria-describedby={rationale ? rationaleId : undefined}
          className="mt-1 size-4 shrink-0 accent-(--accent)"
        />
        {marker ? <span className="font-mono text-sm text-ink-2">{marker}</span> : null}
        <span className="flex-1">{label}</span>
        {feedback !== "neutral" ? <span className="sr-only">{feedbackLabel[feedback]}</span> : null}
        <FeedbackIcon state={feedback} />
      </label>
      <ElementRationale id={rationaleId} text={rationale} className="ml-4" />
    </div>
  );
}
