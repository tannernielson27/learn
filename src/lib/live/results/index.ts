/**
 * `src/lib/live/results` — how a room answered one item, per item type (#179).
 *
 * Pure TypeScript like the rest of `src/lib/live`. Reads the full item, key included, so it runs
 * host-side or server-side only: its output marks the correct choices and must never be sent to a
 * participant (ADR 0002, ADR 0003).
 */
import type { Item } from "@/lib/ngn/schemas";
import {
  dragdropClozeDistribution,
  dropdownClozeDistribution,
  dropdownTableDistribution,
} from "./blanks";
import {
  groupingDistribution,
  highlightTableDistribution,
  highlightTextDistribution,
  matrixMultipleChoiceDistribution,
  matrixMultipleResponseDistribution,
} from "./grid";
import { multipleChoiceDistribution, multipleResponseDistribution } from "./options";
import { orderedResponseDistribution } from "./order";
import { dragdropRationaleDistribution, dropdownRationaleDistribution } from "./pairs";
import { bowtieDistribution } from "./slots";
import type { Distribution } from "./types";

export { COMMON_WRONG_LIMIT } from "./pairs";
export type * from "./types";

const unreachable = (value: never): never => {
  throw new Error(`no distribution for item type ${JSON.stringify(value)}`);
};

/**
 * Counts how a room answered `item`. `responses` are the stored answers as they come out of the
 * database (one per participant, `unknown` because they are not trusted): each is parsed with the
 * item type's response schema, and any that cannot be read are counted as `unreadable` rather
 * than thrown on. Never mutates its inputs.
 */
export function distributionFor(item: Item, responses: readonly unknown[]): Distribution {
  switch (item.type) {
    case "multiple_choice":
      return multipleChoiceDistribution(item, responses);
    case "multiple_response":
      return multipleResponseDistribution(item, responses);
    case "multiple_response_grouping":
      return groupingDistribution(item, responses);
    case "matrix_multiple_choice":
      return matrixMultipleChoiceDistribution(item, responses);
    case "matrix_multiple_response":
      return matrixMultipleResponseDistribution(item, responses);
    case "dropdown_cloze":
      return dropdownClozeDistribution(item, responses);
    case "dropdown_rationale":
      return dropdownRationaleDistribution(item, responses);
    case "dropdown_table":
      return dropdownTableDistribution(item, responses);
    case "highlight_text":
      return highlightTextDistribution(item, responses);
    case "highlight_table":
      return highlightTableDistribution(item, responses);
    case "dragdrop_cloze":
      return dragdropClozeDistribution(item, responses);
    case "dragdrop_rationale":
      return dragdropRationaleDistribution(item, responses);
    case "ordered_response":
      return orderedResponseDistribution(item, responses);
    case "bowtie":
      return bowtieDistribution(item, responses);
    default:
      return unreachable(item);
  }
}
