import { z } from "zod";
import type { ItemOf } from "../schemas";
import {
  draftEnvelopeFields,
  draftOptionSchema,
  elementRationale,
  envelopeDraftOf,
  envelopeOf,
  needsAnswer,
  needsFix,
  numberedId,
  perElementOf,
  resolveScoring,
  STATED_RULE_TEXT,
  type DraftContext,
  type DraftConversion,
  type DraftReason,
} from "./common";
import { letterOf, normalizeLine, parseAnswer, readMarked } from "./text";

// ---------------------------------------------------------------------------
// ordered_response
// ---------------------------------------------------------------------------

export const orderedResponseDraftSchema = z.object({
  type: z.literal("ordered_response"),
  ...draftEnvelopeFields,
  steps: z
    .array(
      z.object({
        text: z
          .string()
          .describe("One step to put in order, without its letter or number, word for word."),
        rationale: draftOptionSchema.shape.rationale,
      }),
    )
    .describe("Every step, in the order the source lists them (not the answer's order)."),
  answer: z
    .string()
    .optional()
    .describe(
      'The correct order exactly as the source prints it, such as "C, A, D, B" or the steps\' words in order. Leave it out when the source gives no order. Never work out an order yourself.',
    ),
});
export type OrderedResponseDraft = z.infer<typeof orderedResponseDraftSchema>;

const ORDERED_SCORING = { default: "zero_one", allowed: ["zero_one", "position"] } as const;

export function fromOrderedResponseDraft(
  draft: OrderedResponseDraft,
  context: DraftContext = {},
): DraftConversion<"ordered_response"> {
  const steps = draft.steps.map((step, index) => ({
    ...step,
    id: numberedId("step", index),
    label: readMarked(step.text).text,
  }));
  const scoring = resolveScoring(draft.statedScoring, ORDERED_SCORING);
  const order =
    draft.answer === undefined || draft.answer.trim() === ""
      ? undefined
      : parseAnswer(
          draft.answer,
          steps.map((step) => step.label),
        );
  const isPermutation =
    order !== undefined && order.length === steps.length && new Set(order).size === steps.length;
  const keyReasons: DraftReason[] =
    draft.answer === undefined || draft.answer.trim() === ""
      ? [
          needsAnswer(
            "The source gives no correct order. Add it before this question can be imported.",
          ),
        ]
      : isPermutation
        ? []
        : [
            needsFix(
              `The order in the source ("${draft.answer.trim()}") does not list every step exactly once.`,
              ["answer"],
            ),
          ];
  const partial = scoring.rule === "position";
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(steps)),
      type: "ordered_response",
      content: {
        items: steps.map((step) => ({ id: step.id, label: step.label })),
        ...(partial ? { partial: "position" as const } : {}),
      },
      answerKey: { orderedIds: isPermutation ? order.map((index) => steps[index].id) : [] },
      scoring: { model: "zero_one", maxPoints: partial ? Math.max(1, steps.length) : 1 },
    },
    reasons: [...keyReasons, ...scoring.reasons],
  };
}

export function toOrderedResponseDraft(item: ItemOf<"ordered_response">): OrderedResponseDraft {
  const ids = item.content.items.map((step) => step.id);
  return {
    type: "ordered_response",
    ...envelopeDraftOf(
      item,
      STATED_RULE_TEXT[item.content.partial === "position" ? "position" : "zero_one"],
    ),
    steps: item.content.items.map((step) => ({
      text: step.label,
      ...elementRationale(item, step.id),
    })),
    answer: item.answerKey.orderedIds.map((id) => letterOf(ids.indexOf(id))).join(", "),
  };
}

// ---------------------------------------------------------------------------
// bowtie
// ---------------------------------------------------------------------------

const BOWTIE_COLUMNS = [
  { field: "actions", prefix: "act", key: 2, noun: "actions" },
  { field: "conditions", prefix: "cond", key: 1, noun: "condition" },
  { field: "parameters", prefix: "par", key: 2, noun: "parameters" },
] as const;

const bowtieColumn = (what: string) =>
  z.array(draftOptionSchema).describe(`Every ${what} choice, in the order the source lists them.`);

export const bowtieDraftSchema = z.object({
  type: z.literal("bowtie"),
  ...draftEnvelopeFields,
  actions: bowtieColumn("action to take"),
  conditions: bowtieColumn("potential condition"),
  parameters: bowtieColumn("parameter to monitor"),
  labels: z
    .object({
      actions: z.string().optional(),
      condition: z.string().optional(),
      parameters: z.string().optional(),
    })
    .optional()
    .describe(
      'The three column headings, only when the source prints headings other than "Actions to Take", "Potential Condition" and "Parameters to Monitor".',
    ),
});
export type BowtieDraft = z.infer<typeof bowtieDraftSchema>;

const BOWTIE_SCORING = { default: "zero_one", allowed: ["zero_one"] } as const;

export function fromBowtieDraft(
  draft: BowtieDraft,
  context: DraftContext = {},
): DraftConversion<"bowtie"> {
  const columns = BOWTIE_COLUMNS.map((column) => {
    const choices = draft[column.field].map((choice, index) => ({
      ...choice,
      id: numberedId(column.prefix, index),
      ...readMarked(choice.text),
    }));
    return { ...column, choices, keyed: choices.filter((c) => c.marked).map((c) => c.id) };
  });
  const [actions, conditions, parameters] = columns;
  const scoring = resolveScoring(draft.statedScoring, BOWTIE_SCORING);
  const anyMarked = columns.some((column) => column.keyed.length > 0);
  const keyReasons: DraftReason[] = !anyMarked
    ? [
        needsAnswer(
          "The source marks no answers. Add the key before this question can be imported.",
        ),
      ]
    : columns.flatMap((column) =>
        column.keyed.length === column.key
          ? []
          : [
              needsFix(
                `The source marks ${column.keyed.length} ${column.noun}; a bowtie needs ${column.key}.`,
                [column.field],
              ),
            ],
      );
  const labels = Object.fromEntries(
    Object.entries(draft.labels ?? {}).flatMap(([name, value]) =>
      value === undefined || normalizeLine(value) === "" ? [] : [[name, normalizeLine(value)]],
    ),
  );
  const content = (column: (typeof columns)[number]) =>
    column.choices.map((choice) => ({ id: choice.id, label: choice.text }));
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(columns.flatMap((column) => column.choices))),
      type: "bowtie",
      content: {
        actions: content(actions),
        conditions: content(conditions),
        parameters: content(parameters),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
      },
      answerKey: {
        actionIds: actions.keyed,
        conditionId: conditions.keyed.length === 1 ? conditions.keyed[0] : "",
        parameterIds: parameters.keyed,
      },
      scoring: { model: scoring.rule, maxPoints: 5 },
    },
    reasons: [...keyReasons, ...scoring.reasons],
  };
}

export function toBowtieDraft(item: ItemOf<"bowtie">): BowtieDraft {
  const correct = new Set([
    ...item.answerKey.actionIds,
    item.answerKey.conditionId,
    ...item.answerKey.parameterIds,
  ]);
  const column = (choices: readonly { id: string; label: string }[]) =>
    choices.map((choice) => ({
      text: correct.has(choice.id) ? `${choice.label} *` : choice.label,
      ...elementRationale(item, choice.id),
    }));
  return {
    type: "bowtie",
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    actions: column(item.content.actions),
    conditions: column(item.content.conditions),
    parameters: column(item.content.parameters),
    labels: { ...item.content.labels },
  };
}
