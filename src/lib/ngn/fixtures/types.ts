import type { ItemInputOf, ItemType, ResponseOf } from "../schemas";

export interface ScoreCase<T extends ItemType> {
  name: string;
  response: ResponseOf<T>;
  expectedPoints: number;
}

export interface ItemFixture<T extends ItemType> {
  type: T;
  /** A complete, realistic item. Drives the gallery and screenshots. */
  canonical: ItemInputOf<T>;
  /** A boundary case (max options, single blank, per-row scoring, etc.). */
  edge: ItemInputOf<T>;
  /** Scoring expectations against `canonical`. */
  cases: ScoreCase<T>[];
}

export { SAMPLE_TAG } from "../types";
export const md = (value: string) => ({ kind: "markdown" as const, value });
