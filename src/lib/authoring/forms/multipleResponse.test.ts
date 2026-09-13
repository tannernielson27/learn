import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleResponseItemSchema } from "@/lib/ngn/schemas";
import {
  emptyMultipleResponseForm,
  fromMultipleResponseForm,
  toMultipleResponseForm,
} from "./multipleResponse";

const fixture = FIXTURES.multiple_response;
const parse = (input: unknown) => multipleResponseItemSchema.parse(input);

describe("multiple response form mapping", () => {
  it.each([
    ["canonical", fixture.canonical],
    ["edge", fixture.edge],
  ])("round-trips the %s fixture: item -> form -> item", (_name, input) => {
    const item = parse(input);
    expect(parse(fromMultipleResponseForm(toMultipleResponseForm(item)))).toEqual(item);
  });

  it("marks correctness on each option rather than keeping a separate list", () => {
    const item = parse(fixture.canonical);
    const form = toMultipleResponseForm(item);
    const marked = form.options.filter((option) => option.correct).map((option) => option.id);
    expect(marked.sort()).toEqual([...item.answerKey.correctOptionIds].sort());
  });

  it("drops the Select N count for SATA, so a stale count is never stored", () => {
    const form = {
      ...toMultipleResponseForm(parse(fixture.canonical)),
      variant: "sata" as const,
      n: 3,
    };
    expect(fromMultipleResponseForm(form).content).not.toHaveProperty("n");
  });

  it("stores the count for Select N", () => {
    const form = {
      ...toMultipleResponseForm(parse(fixture.canonical)),
      variant: "select_n" as const,
      n: 2,
    };
    expect(fromMultipleResponseForm(form).content).toMatchObject({ variant: "select_n", n: 2 });
  });

  it("starts a new item as SATA with five blank, unmarked options", () => {
    const form = emptyMultipleResponseForm("mr_new");
    expect(form.variant).toBe("sata");
    expect(form.options).toHaveLength(5);
    expect(form.options.every((option) => !option.correct && option.label === "")).toBe(true);
    expect(new Set(form.options.map((option) => option.id)).size).toBe(5);
    expect(multipleResponseItemSchema.safeParse(fromMultipleResponseForm(form)).success).toBe(
      false,
    );
  });
});
