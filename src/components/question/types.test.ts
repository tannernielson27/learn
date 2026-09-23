import { describe, expectTypeOf, it } from "vitest";
import type { ItemOf, ItemType } from "@/lib/ngn/schemas";
import type { ItemRendererModule, ItemRendererProps } from "./types";

/**
 * A renderer is handed the item without its key and rationale in answer and review modes (ADR
 * 0003), so its props must say so: reading either without checking for it first has to fail the
 * typecheck, not throw in a student's browser (#50). `pnpm typecheck` enforces the
 * `@ts-expect-error` lines below; the `expectTypeOf` assertions run under vitest as well.
 */

type RendererItem<T extends ItemType> = ItemRendererProps<T>["item"];

/** True only when `K` is an optional key of `O` for every member of the union. */
type IsOptional<O, K extends PropertyKey> = O extends unknown
  ? K extends keyof O
    ? object extends Pick<O, K>
      ? true
      : false
    : false
  : never;

type EveryType<F> = { [T in ItemType]: F };

describe("renderer props (#50)", () => {
  it("leave answerKey and rationale optional for every item type", () => {
    expectTypeOf<{
      [T in ItemType]: IsOptional<RendererItem<T>, "answerKey">;
    }>().toEqualTypeOf<EveryType<true>>();
    expectTypeOf<{
      [T in ItemType]: IsOptional<RendererItem<T>, "rationale">;
    }>().toEqualTypeOf<EveryType<true>>();
  });

  it("keep the key's own shape once it is there", () => {
    expectTypeOf<RendererItem<"multiple_choice">["answerKey"]>().toEqualTypeOf<
      ItemOf<"multiple_choice">["answerKey"] | undefined
    >();
    expectTypeOf<RendererItem<"bowtie">["rationale"]>().toEqualTypeOf<
      ItemOf<"bowtie">["rationale"] | undefined
    >();
  });

  it("reject a read of either without optional chaining", () => {
    const readsBlind = ({ item }: ItemRendererProps<"multiple_choice">) => [
      // @ts-expect-error the answer key is absent outside feedback mode.
      item.answerKey.correctOptionId,
      // @ts-expect-error the rationale is absent outside feedback mode.
      item.rationale.general,
    ];
    const readsChecked = ({ item }: ItemRendererProps<"multiple_choice">) =>
      item.answerKey?.correctOptionId ?? item.rationale?.general?.value;
    expectTypeOf(readsBlind).toBeFunction();
    expectTypeOf(readsChecked).returns.toEqualTypeOf<string | undefined>();
  });

  it("give isComplete the same keyless item the renderer gets", () => {
    expectTypeOf<Parameters<ItemRendererModule<"bowtie">["isComplete"]>[0]>().toEqualTypeOf<
      RendererItem<"bowtie">
    >();
  });
});
