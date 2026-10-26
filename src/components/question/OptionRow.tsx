import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { RichText } from "@/lib/ngn/schemas";
import { ElementRationale } from "./ElementRationale";
import { feedbackMarkClasses } from "./feedbackMarks";
import { useFeedbackWordClass } from "./FeedbackWords";
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
  // Missed has no icon: a check on an option the student did not pick read as their own right
  // answer. It has the dashed border (docs/04 §4) and the word instead.
  if (state === "neutral" || state === "missed") return null;
  const isCorrect = state === "correct";
  return (
    <span
      aria-hidden="true"
      data-feedback-mark={state}
      className={`${className} shrink-0 leading-none ${isCorrect ? "text-correct" : "text-incorrect"}`}
    >
      <Icon icon={isCorrect ? Check : X} className="size-4.5" />
    </span>
  );
}

/** The colour a mark's icon and word share. */
const FEEDBACK_INK: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "text-correct",
  incorrect: "text-incorrect",
  missed: "text-correct",
};

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
  const markerId = `${id}-marker`;
  const textId = `${id}-text`;
  const feedbackId = `${id}-feedback`;
  const hasFeedback = feedback !== "neutral";
  const feedbackWordClass = useFeedbackWordClass();
  // The control is named by the row's own text, which is then hidden from the accessibility tree:
  // left exposed, it was read a second time after the name (#60). A hidden element still names
  // whatever points at it with aria-labelledby. The whole row stays the label for the tap target.
  const labelledBy = [marker ? markerId : null, textId, hasFeedback ? feedbackId : null]
    .filter(Boolean)
    .join(" ");
  // Selected: the accent edge doubled by a ring (2px without moving the text) over the soft fill.
  const selected = checked && mode !== "feedback";
  const selectedClasses = selected ? "border-accent ring-1 ring-accent bg-accent-soft" : "";
  return (
    <div>
      <label
        htmlFor={id}
        className={`option flex min-h-(--option-min-height) cursor-pointer items-start gap-3.5 rounded-md border px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-fast ease-out-expo ${
          interactive && !selected ? "hover:bg-surface-2" : ""
        } ${interactive ? "" : "cursor-default"} ${selectedClasses} ${feedbackMarkClasses(feedback, selected ? "" : "border-field-border", "bg-surface-1")} ${disabled && !checked ? "opacity-50" : ""}`}
      >
        <input
          id={id}
          name={name}
          type={kind}
          checked={checked}
          disabled={!interactive}
          onChange={onToggle}
          aria-labelledby={labelledBy}
          aria-describedby={rationale ? rationaleId : undefined}
          className="mt-1 size-4.5 shrink-0 accent-(--accent)"
        />
        {marker ? (
          // Traditional multiple choice only (docs/04 §6): the letter in a ring, filled when chosen.
          <span
            id={markerId}
            aria-hidden="true"
            className={`-mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] font-mono text-xs font-semibold ${
              selected
                ? "border-accent bg-accent text-accent-contrast"
                : "border-field-border text-ink-2"
            }`}
          >
            {marker}
          </span>
        ) : null}
        <span id={textId} aria-hidden="true" className="min-w-0 flex-1 break-words">
          {label}
        </span>
        {hasFeedback ? (
          // The mark: icon and word together at the row's end, in the mark's colour (Foundation).
          <span
            className={`mt-0.5 ml-auto inline-flex shrink-0 items-center ${FEEDBACK_INK[feedback]}`}
          >
            <FeedbackIcon state={feedback} className="" />
            <span id={feedbackId} aria-hidden="true" className={feedbackWordClass}>
              {feedbackLabel[feedback]}
            </span>
          </span>
        ) : null}
      </label>
      <ElementRationale id={rationaleId} text={rationale} className="ml-4" />
    </div>
  );
}
