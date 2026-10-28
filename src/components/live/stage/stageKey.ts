/**
 * The answer key on the projector (feat/stage-answer-key): which item the stage may draw with its
 * key, and the choices a key view leaves off the wall.
 *
 * `stageKey` is the stage's one door to the key. The host's console holds every item with its key
 * (ADR 0002), and the stage reads the question through `stageQuestion`, which copies none of it;
 * this hands the whole item over only once the room's answer is showing, as `stageRationale`
 * does the rationale. Nothing here is sent anywhere: the stage is the host's own view.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import type { Item } from "@/lib/ngn/schemas";

/** The item with its key, only once the answer is showing; null before then. */
export function stageKey(item: Item | null, revealed: boolean): Item | null {
  return revealed ? item : null;
}

export interface NotCorrectGroup {
  /** What the choices were offered for: a bowtie column, a blank, a table row. Null for one list. */
  label: string | null;
  options: string[];
}

const others = (
  choices: readonly { id: string; label: string }[],
  keyed: (id: string) => boolean,
): string[] => choices.filter((choice) => !keyed(choice.id)).map((choice) => choice.label);

/** "Blank 1", "Blank 2"... in the sentence's order; nothing for a sentence with one blank. */
const blankLabel = (index: number, count: number): string | null =>
  count > 1 ? `Blank ${index + 1}` : null;

/**
 * The choices the key leaves out, for a layout whose renderer draws only what fills its slots once
 * answered: a bowtie's slots, a drop-down's chosen word, a drag-and-drop's placed tokens. The room
 * sees the wrong choices beside the right ones, so the teacher can say why each is wrong. Every
 * other layout draws all of its choices beside the key already, and has nothing listed here.
 */
export function notCorrect(item: Item): NotCorrectGroup[] {
  switch (item.type) {
    case "bowtie": {
      const { actions, conditions, parameters, labels } = item.content;
      const key = item.answerKey;
      return [
        { label: labels.actions, options: others(actions, (id) => key.actionIds.includes(id)) },
        { label: labels.condition, options: others(conditions, (id) => id === key.conditionId) },
        {
          label: labels.parameters,
          options: others(parameters, (id) => key.parameterIds.includes(id)),
        },
      ];
    }
    case "dropdown_cloze":
    case "dropdown_rationale": {
      const { blanks } = item.content;
      return blanks.map((blank, index) => {
        const correct = item.answerKey.blanks.find((each) => each.blankId === blank.id);
        return {
          label: blankLabel(index, blanks.length),
          options: others(blank.choices, (id) => id === correct?.correctChoiceId),
        };
      });
    }
    case "dropdown_table":
      return item.content.rows.map((row) => {
        const correct = item.answerKey.rows.find((each) => each.rowId === row.id);
        return {
          label: row.label,
          options: others(row.choices, (id) => id === correct?.correctChoiceId),
        };
      });
    case "dragdrop_cloze":
    case "dragdrop_rationale": {
      const keyed = new Set(item.answerKey.blanks.map((blank) => blank.correctTokenId));
      const options = others(item.content.bank, (id) => keyed.has(id));
      return options.length === 0 ? [] : [{ label: null, options }];
    }
    default:
      return [];
  }
}
