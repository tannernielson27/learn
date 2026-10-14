import { z } from "zod";
import type { ItemOf } from "../schemas";
import {
  draftEnvelopeFields,
  draftAnswerField,
  draftOptionSchema,
  elementRationale,
  envelopeDraftOf,
  envelopeOf,
  needsAnswer,
  needsFix,
  numberedId,
  perElementOf,
  readOptionKeys,
  resolveScoring,
  STATED_RULE_TEXT,
  type DraftContext,
  type DraftConversion,
  type DraftReason,
} from "./common";
import { letterOf, normalizeLine } from "./text";

/** Drop-down table (#338): one drop-down per row, each with its own choices. */

export const dropdownTableDraftSchema = z.object({
  type: z.literal("dropdown_table"),
  ...draftEnvelopeFields,
  rowHeading: z
    .string()
    .describe(
      'The heading of the column that names each row, such as "Medication", word for word.',
    ),
  choiceHeading: z
    .string()
    .describe(
      'The heading of the column that holds the drop-downs, such as "Nursing action", word for word.',
    ),
  rows: z
    .array(
      z.object({
        label: z.string().describe("What the row names, word for word."),
        choices: z
          .array(z.string())
          .describe(
            "The row's drop-down choices in the order the source lists them, word for word. Keep the source's * or check mark on a keyed choice. Never add a mark the source does not have.",
          ),
        answer: draftAnswerField,
        rationale: draftOptionSchema.shape.rationale,
      }),
    )
    .describe("Every row, in the order the source lists them."),
});
export type DropdownTableDraft = z.infer<typeof dropdownTableDraftSchema>;

const TABLE_SCORING = { default: "zero_one", allowed: ["zero_one"] } as const;

export function fromDropdownTableDraft(
  draft: DropdownTableDraft,
  context: DraftContext = {},
): DraftConversion<"dropdown_table"> {
  const reasons: DraftReason[] = [];
  const rows = draft.rows.map((row, index) => {
    const id = numberedId("row", index);
    const read = readOptionKeys(
      row.choices.map((text) => ({ text })),
      row.answer,
    );
    reasons.push(...read.reasons.map((reason) => ({ ...reason, path: ["rows", index, "answer"] })));
    const keys = read.keys ?? [];
    if (keys.length > 1) {
      reasons.push(
        needsFix(`Row ${index + 1} has ${keys.length} answers; a drop-down has one.`, [
          "rows",
          index,
        ]),
      );
    }
    const choiceIds = read.labels.map((_, choice) => `${id}_${letterOf(choice).toLowerCase()}`);
    return {
      id,
      label: normalizeLine(row.label),
      rationale: row.rationale,
      choices: read.labels.map((label, choice) => ({ id: choiceIds[choice], label })),
      keyCount: keys.length,
      key: keys.length === 1 ? choiceIds[keys[0]] : undefined,
    };
  });
  const keyReasons: DraftReason[] = rows.every((row) => row.keyCount === 0)
    ? rows.length === 0
      ? []
      : [
          needsAnswer(
            "The source marks no answers. Add the key before this question can be imported.",
          ),
        ]
    : rows.flatMap((row, index) =>
        row.keyCount === 0
          ? [needsFix(`Row ${index + 1} has no answer in the source.`, ["rows", index])]
          : [],
      );
  const scoring = resolveScoring(draft.statedScoring, TABLE_SCORING);
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(rows)),
      type: "dropdown_table",
      content: {
        columns: {
          label: normalizeLine(draft.rowHeading),
          dropdown: normalizeLine(draft.choiceHeading),
        },
        rows: rows.map(({ id, label, choices }) => ({ id, label, choices })),
      },
      answerKey: {
        rows: rows.flatMap(({ id, key }) =>
          key === undefined ? [] : [{ rowId: id, correctChoiceId: key }],
        ),
      },
      scoring: { model: scoring.rule, maxPoints: Math.max(1, rows.length) },
    },
    reasons: [...reasons, ...keyReasons, ...scoring.reasons],
  };
}

export function toDropdownTableDraft(item: ItemOf<"dropdown_table">): DropdownTableDraft {
  const keys = new Map(item.answerKey.rows.map((key) => [key.rowId, key.correctChoiceId]));
  return {
    type: "dropdown_table",
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    rowHeading: item.content.columns.label,
    choiceHeading: item.content.columns.dropdown,
    rows: item.content.rows.map((row) => ({
      label: row.label,
      choices: row.choices.map((choice) =>
        keys.get(row.id) === choice.id ? `${choice.label}*` : choice.label,
      ),
      ...elementRationale(item, row.id),
    })),
  };
}
