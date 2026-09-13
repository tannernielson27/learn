import { describe, expect, it } from "vitest";
import { EDITOR_READY_TYPES } from "@/lib/authoring/itemTypeGroups";
import { FIXTURES } from "@/lib/ngn/fixtures";
import type { ItemType } from "@/lib/ngn/labels";
import { ITEM_SCHEMAS, type AnyResponse, type Item } from "@/lib/ngn/schemas";
import { scoreItem } from "@/lib/ngn/scoring";
import { parseScoreRequest, scoreForReveal, SCORE_REQUEST_ERRORS } from "./scoreRequest";

const parsed = (type: ItemType) => ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical) as Item;

// Every scoring case the fixtures define, for the Sprint 1 types.
const cases = [...EDITOR_READY_TYPES].flatMap((type) =>
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

describe("parseScoreRequest", () => {
  it.each(cases)("accepts the fixture response %s", (_name, type, response) => {
    expect(parseScoreRequest({ response }, type)).toMatchObject({ ok: true });
  });

  it.each([
    ["no body", null],
    ["a string body", "optionId=opt_a"],
    ["no response", {}],
    ["a response that is not an object", { response: "opt_a" }],
    ["unknown top-level fields", { response: { type: "multiple_choice" }, answerKey: {} }],
  ])("refuses %s with a 400", (_name, body) => {
    expect(parseScoreRequest(body, "multiple_choice")).toEqual({
      ok: false,
      status: 400,
      error: SCORE_REQUEST_ERRORS.malformed,
    });
  });

  it("refuses an answer written for a different item type", () => {
    expect(
      parseScoreRequest(
        { response: { type: "multiple_response", optionIds: [] } },
        "multiple_choice",
      ),
    ).toEqual({ ok: false, status: 400, error: SCORE_REQUEST_ERRORS.wrongType });
  });

  it("refuses a response whose fields do not match its type's schema", () => {
    expect(
      parseScoreRequest({ response: { type: "multiple_choice", optionId: 42 } }, "multiple_choice"),
    ).toEqual({ ok: false, status: 400, error: SCORE_REQUEST_ERRORS.malformed });
  });

  it("uses messages a person can read, with no schema details", () => {
    for (const message of Object.values(SCORE_REQUEST_ERRORS)) {
      expect(message).toMatch(/^[A-Z].*\.$/);
      expect(message).not.toMatch(/zod|schema|optionId|invalid_type/i);
    }
  });
});

describe("scoreForReveal", () => {
  it.each(cases)("matches the gallery's client score for %s", (_name, type, response, expected) => {
    const item = parsed(type);
    const reveal = scoreForReveal(item, response);
    expect(reveal.score.points).toBe(expected);
    expect(reveal.score).toEqual(scoreItem(item, response));
  });

  it("reveals the key and rationale only alongside a score", () => {
    const item = parsed("multiple_choice");
    const reveal = scoreForReveal(item, { type: "multiple_choice", optionId: "opt_a" });
    expect(reveal.answerKey).toEqual(item.answerKey);
    expect(reveal.rationale).toEqual(item.rationale);
    expect(Object.keys(reveal).sort()).toEqual(["answerKey", "rationale", "score"]);
  });
});
