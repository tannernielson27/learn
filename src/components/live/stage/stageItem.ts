/**
 * What the projector shows of the item the room is on, worked out from the host's full item.
 *
 * The host's console is handed every item with its key (ADR 0002: the host is trusted), but the
 * stage is the room's screen. So the question is read through a narrow door: the question text
 * and, for the two layouts the stage can letter, each option's words in the item's own order.
 * Nothing from the key or the rationale is copied into it. The rationale has a door of its own
 * that opens only once the answer is showing, and the chart marks the key only then too.
 *
 * Letters follow the item's order, as `MultipleChoiceItem` letters them on a phone, so "B" on
 * the wall is "B" in every hand (PLAN §5.5). Only multiple choice has letters: a select-all
 * question's phones draw checkboxes with none (its NCLEX layout), so the wall draws none either.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { ResultsChartRow } from "@/components/ui/ResultsChart";
import type { Distribution } from "@/lib/live/results";
import type { Item, RichText } from "@/lib/ngn/schemas";

export interface StageOption {
  /** "A", "B", ... for multiple choice; null for select all that apply, whose phones letter none. */
  letter: string | null;
  label: string;
}

export interface StageQuestion {
  stem: RichText;
  /** One row per option; null for a layout that lives on the phones (matrix, cloze...). */
  options: StageOption[] | null;
}

/** "A", "B", ... for the option at `index`. */
export const optionLetter = (index: number): string => String.fromCharCode(65 + index);

/** The question text and lettered options, or null before the item has arrived. */
export function stageQuestion(item: Item | null): StageQuestion | null {
  if (item === null) return null;
  const options =
    item.type === "multiple_choice" || item.type === "multiple_response"
      ? item.content.options.map((option, index) => ({
          letter: item.type === "multiple_choice" ? optionLetter(index) : null,
          label: option.label,
        }))
      : null;
  return { stem: { kind: item.stem.kind, value: item.stem.value }, options };
}

/** More options than this, and the stage draws the list compact (`crowded`). */
const ROOMY_OPTIONS = 4;
/**
 * More characters than this across the question text and its options, and the stage draws them
 * compact. About what a 1280x720 projector holds at the stage sizes: a three-line stem and four
 * one-line options.
 */
const ROOMY_CHARACTERS = 360;

/**
 * Whether a question has more to show than a short projector holds at full size (1280x720). A
 * crowded question's stem is clamped and its options are drawn compact, so every option row and
 * every bar stays on the wall; the whole text is on every phone.
 */
export function crowded(stem: string, labels: readonly string[]): boolean {
  if (labels.length > ROOMY_OPTIONS) return true;
  const characters = labels.reduce((sum, label) => sum + label.length, stem.length);
  return characters > ROOMY_CHARACTERS;
}

/** The item's general rationale, only once the answer is showing. */
export function stageRationale(item: Item | null, revealed: boolean): RichText | null {
  if (!revealed || item === null) return null;
  return item.rationale.general ?? null;
}

/**
 * The results chart's rows for a one-bar-per-option result, the key marked only when `revealed`.
 * Lettered for multiple choice only, as the question is (`stageQuestion`). Null for every other
 * kind, which the console draws with its own result views.
 */
export function chartRows(
  distribution: Distribution | null,
  revealed: boolean,
): ResultsChartRow[] | null {
  if (distribution === null || distribution.kind !== "options") return null;
  const lettered = distribution.itemType === "multiple_choice";
  return distribution.options.map((option, index) => ({
    ...(lettered ? { letter: optionLetter(index) } : {}),
    label: option.label,
    count: option.count,
    isKey: revealed && option.correct,
  }));
}
