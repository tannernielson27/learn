import type { ItemType } from "../schemas";
import { sampleCaseStudy, sampleEhr } from "./case-study";
import {
  dragdropClozeFixture,
  dragdropRationaleFixture,
  dropdownClozeFixture,
  dropdownRationaleFixture,
  dropdownTableFixture,
} from "./cloze";
import {
  matrixMultipleChoiceFixture,
  matrixMultipleResponseFixture,
  multipleChoiceFixture,
  multipleResponseFixture,
  multipleResponseGroupingFixture,
} from "./selection";
import {
  bowtieFixture,
  highlightTableFixture,
  highlightTextFixture,
  orderedResponseFixture,
} from "./structured";
import { sampleTrendEhr, sampleTrendItem } from "./trend";
import type { ItemFixture } from "./types";

export * from "./types";
export { sampleCaseStudy, sampleEhr, sampleTrendEhr, sampleTrendItem };

export const FIXTURES: { [T in ItemType]: ItemFixture<T> } = {
  multiple_choice: multipleChoiceFixture,
  multiple_response: multipleResponseFixture,
  multiple_response_grouping: multipleResponseGroupingFixture,
  matrix_multiple_choice: matrixMultipleChoiceFixture,
  matrix_multiple_response: matrixMultipleResponseFixture,
  dropdown_cloze: dropdownClozeFixture,
  dropdown_rationale: dropdownRationaleFixture,
  dropdown_table: dropdownTableFixture,
  highlight_text: highlightTextFixture,
  highlight_table: highlightTableFixture,
  dragdrop_cloze: dragdropClozeFixture,
  dragdrop_rationale: dragdropRationaleFixture,
  ordered_response: orderedResponseFixture,
  bowtie: bowtieFixture,
};

export type AnyItemFixture = { [T in ItemType]: ItemFixture<T> }[ItemType];

export const allFixtures: AnyItemFixture[] = Object.values(FIXTURES);
