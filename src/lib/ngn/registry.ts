import { DRAFTS, isDraftType, type DraftType } from "./draft";
import { FIXTURES } from "./fixtures";
import { ITEM_TYPE_LABELS, ITEM_TYPES, SCORING_MODEL_LABELS, type ItemType } from "./labels";
import { ITEM_SCHEMAS } from "./schemas";
import { SCORERS } from "./scoring/items";

// The labels live in ./labels, which client components import directly: this module pulls in
// every schema, scorer and fixture, and belongs on the server or in tests.
export { ITEM_TYPE_LABELS, ITEM_TYPES, SCORING_MODEL_LABELS };

export const NGN_REGISTRY = Object.fromEntries(
  ITEM_TYPES.map((type) => [
    type,
    {
      type,
      label: ITEM_TYPE_LABELS[type],
      schema: ITEM_SCHEMAS[type],
      score: SCORERS[type],
      fixture: FIXTURES[type],
      draft: isDraftType(type) ? DRAFTS[type] : undefined,
    },
  ]),
) as {
  [T in ItemType]: {
    type: T;
    label: string;
    schema: (typeof ITEM_SCHEMAS)[T];
    score: (typeof SCORERS)[T];
    fixture: (typeof FIXTURES)[T];
    /** The AI draft shape and its converters (#337, #338); undefined until the type has one. */
    draft: T extends DraftType ? (typeof DRAFTS)[T] : undefined;
  };
};
