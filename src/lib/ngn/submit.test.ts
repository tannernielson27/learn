// The submit seam (#56). ADR 0003: every student-facing payload builder ships with a test that it
// never includes the key, and one item scores the same however it was submitted.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { ITEM_TYPES, type ItemType } from "./labels";
import { ITEM_SCHEMAS, multipleChoiceItemSchema, type AnyResponse, type Item } from "./schemas";
import { scoreItem } from "./scoring";
import {
  parseSubmission,
  scoreInProcess,
  scoreSubmission,
  SUBMIT_ERRORS,
  toKeylessItem,
} from "./submit";

const parsed = (type: ItemType) => ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical) as Item;

const samples = ITEM_TYPES.flatMap((type) => {
  const fixture = FIXTURES[type];
  return [
    [`${type} canonical`, ITEM_SCHEMAS[type].parse(fixture.canonical) as Item],
    [`${type} edge`, ITEM_SCHEMAS[type].parse(fixture.edge) as Item],
  ] as const;
});

// Every scoring case the fixtures define.
const cases = ITEM_TYPES.flatMap((type) =>
  FIXTURES[type].cases.map(
    (entry) =>
      [
        `${type}: ${entry.name}`,
        type,
        entry.response as AnyResponse,
        entry.expectedPoints,
      ] as const,
  ),
);

describe("toKeylessItem", () => {
  it("covers every item type", () => {
    expect(new Set(samples.map(([, item]) => item.type))).toEqual(new Set(ITEM_TYPES));
  });

  it.each(samples)("never includes the answer key, rationale or scoring: %s", (_name, item) => {
    const payload = toKeylessItem(item);
    expect(payload).not.toHaveProperty("answerKey");
    expect(payload).not.toHaveProperty("rationale");
    // For +/- items maxPoints is the number of correct answers, so it tells a student how many
    // to pick (#94). The model and points arrive with the score instead.
    expect(payload).not.toHaveProperty("scoring");
    // Serialized too, so nothing nested carries them either.
    const json = JSON.stringify(payload);
    expect(json).not.toContain('"answerKey":');
    expect(json).not.toContain('"rationale":');
    expect(json).not.toContain('"scoring":');
    expect(json).not.toContain("maxPoints");
    expect(json).not.toMatch(/"correct[A-Za-z]*":/);
  });

  it.each(samples)("keeps what the player needs to render: %s", (_name, item) => {
    const payload = toKeylessItem(item);
    expect(payload).toMatchObject({
      id: item.id,
      type: item.type,
      stem: item.stem,
      content: item.content,
    });
  });

  it("does not change the item it is given", () => {
    const item = parsed("multiple_choice");
    const before = JSON.stringify(item);
    toKeylessItem(item);
    expect(JSON.stringify(item)).toBe(before);
  });
});

describe("parseSubmission", () => {
  it.each(cases)("accepts the fixture response %s", (_name, type, response) => {
    expect(parseSubmission({ response }, type)).toMatchObject({ ok: true });
  });

  it.each([
    ["no body", null],
    ["a string body", "optionId=opt_a"],
    ["no response", {}],
    ["a response that is not an object", { response: "opt_a" }],
    ["unknown top-level fields", { response: { type: "multiple_choice" }, answerKey: {} }],
  ])("refuses %s with a 400", (_name, body) => {
    expect(parseSubmission(body, "multiple_choice")).toEqual({
      ok: false,
      status: 400,
      error: SUBMIT_ERRORS.malformed,
    });
  });

  it("refuses an answer written for a different item type", () => {
    expect(
      parseSubmission(
        { response: { type: "multiple_response", optionIds: [] } },
        "multiple_choice",
      ),
    ).toEqual({ ok: false, status: 400, error: SUBMIT_ERRORS.wrongType });
  });

  it("refuses a response whose fields do not match its type's schema", () => {
    expect(
      parseSubmission({ response: { type: "multiple_choice", optionId: 42 } }, "multiple_choice"),
    ).toEqual({ ok: false, status: 400, error: SUBMIT_ERRORS.malformed });
  });

  it("uses messages a person can read, with no schema details", () => {
    for (const message of Object.values(SUBMIT_ERRORS)) {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toMatch(/zod|schema|optionId|invalid_type/i);
    }
  });
});

describe("scoreSubmission", () => {
  it.each(cases)("scores %s exactly as the engine does", (_name, type, response, expected) => {
    const item = parsed(type);
    const reveal = scoreSubmission(item, response);
    expect(reveal.score.points).toBe(expected);
    expect(reveal.score).toEqual(scoreItem(item, response));
  });

  it("reveals the key, rationale and scoring only alongside a score", () => {
    const item = parsed("multiple_response");
    const reveal = scoreSubmission(item, { type: "multiple_response", optionIds: [] });
    expect(reveal.answerKey).toEqual(item.answerKey);
    expect(reveal.rationale).toEqual(item.rationale);
    expect(reveal.scoring).toEqual(item.scoring);
    expect(reveal.score).toMatchObject(item.scoring);
    expect(Object.keys(reveal).sort()).toEqual(["answerKey", "rationale", "score", "scoring"]);
  });
});

describe("scoreInProcess", () => {
  const mc = multipleChoiceItemSchema.parse(FIXTURES.multiple_choice.canonical);

  it("is the same seam as a server handler: one response in, one reveal out", async () => {
    const response: AnyResponse = {
      type: "multiple_choice",
      optionId: mc.answerKey.correctOptionId,
    };
    await expect(scoreInProcess(mc)(response)).resolves.toEqual(scoreSubmission(mc, response));
  });

  it("scores against the item it was built for", async () => {
    const wrong = mc.content.options.find((o) => o.id !== mc.answerKey.correctOptionId);
    const reveal = await scoreInProcess(mc)({ type: "multiple_choice", optionId: wrong?.id });
    expect(reveal.score.points).toBe(0);
  });
});
