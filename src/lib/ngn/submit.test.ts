// The submit seam (#56). ADR 0003: every student-facing payload builder ships with a test that it
// never includes the key, and one item scores the same however it was submitted.
import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy, sampleTrendItem } from "./fixtures";
import { ITEM_TYPES, type ItemType } from "./labels";
import {
  caseStudySchema,
  ITEM_SCHEMAS,
  multipleChoiceItemSchema,
  type AnyResponse,
  type Item,
} from "./schemas";
import { scoreItem } from "./scoring";
import { withStartingOrder } from "./startingOrder";
import {
  ANSWER_BEARING_FIELDS,
  parseSubmission,
  scoreInProcess,
  scoreSubmission,
  SUBMIT_ERRORS,
  toKeylessCaseStudy,
  toKeylessItem,
  type AnswerBearingField,
  type KeylessItem,
} from "./submit";

/** Every property name anywhere in a value, however deeply nested, as "a.b[0].c" paths. */
function propertyPaths(value: unknown, at = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, i) => propertyPaths(entry, `${at}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = at ? `${at}.${key}` : key;
    return [path, ...propertyPaths(child, path)];
  });
}

/**
 * "Answer-bearing", operationally, for a property anywhere in a payload (#144): either its name is
 * one of the top-level fields the seam itself classifies as answer-bearing — read off
 * `ANSWER_BEARING_FIELDS`, never listed here, so a fifteenth type is covered the day it is
 * registered — or the name reads like an answer wherever it sits.
 *
 * The second half is what a top-level rule cannot do: catch a type that buried its key *inside*
 * `content` rather than beside it. It is a deliberately wide net. No property name in any of the
 * fourteen types' content, envelope or patient record matches it today (`scorePerRow` does not:
 * the pattern is `scoring`), so a future type that trips it is being asked to justify the name
 * rather than to rename around the test.
 */
const ANSWER_BEARING_NAME = /answer|correct|rationale|scoring|maxPoints/i;
const ANSWER_BEARING = new Set<string>(ANSWER_BEARING_FIELDS);

/** Walks the real object rather than its JSON, so a key hidden under any name is still found. */
const answerBearingIn = (payload: unknown) =>
  propertyPaths(payload).filter((path) => {
    const name = path.split(".").pop() as string;
    return ANSWER_BEARING.has(name) || ANSWER_BEARING_NAME.test(name);
  });

const parsed = (type: ItemType) => ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical) as Item;

const samples = [
  ...ITEM_TYPES.flatMap((type) => {
    const fixture = FIXTURES[type];
    return [
      [`${type} canonical`, ITEM_SCHEMAS[type].parse(fixture.canonical) as Item],
      [`${type} edge`, ITEM_SCHEMAS[type].parse(fixture.edge) as Item],
    ] as const;
  }),
  // No fixture above carries a patient record or a difficulty, and both are student-safe envelope
  // fields that an allow-list could silently drop where a delete-list could not.
  [
    "matrix_multiple_choice with a record and a difficulty",
    ITEM_SCHEMAS.matrix_multiple_choice.parse({
      ...sampleTrendItem,
      difficulty: "hard",
    }) as Item,
  ],
] as const;

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

describe("ANSWER_BEARING_FIELDS", () => {
  it("still holds the three fields ADR 0003 names", () => {
    // A floor, not a ceiling: the list is derived, so it may grow, but reclassifying one of these
    // as student-safe is the leak this story is about. The annotation is the compile-time half —
    // if `AnswerBearingField` stopped including one of them, this line would stop typing.
    const adr: AnswerBearingField[] = ["answerKey", "rationale", "scoring"];
    expect(ANSWER_BEARING_FIELDS).toEqual(expect.arrayContaining(adr));
  });
});

describe("toKeylessItem", () => {
  it("covers every item type", () => {
    expect(new Set(samples.map(([, item]) => item.type))).toEqual(new Set(ITEM_TYPES));
  });

  it.each(samples)("carries no answer-bearing property under any name: %s", (_name, item) => {
    // The negative ADR 0003 actually asks for: not "the three named fields are gone" but "nothing
    // that could be an answer survived". Walks the object, not its JSON, so a key nested inside
    // `content` counts too.
    expect(answerBearingIn(toKeylessItem(item))).toEqual([]);
    // The same walk over the item it came from finds them, so the walk is doing something.
    expect(answerBearingIn(item).length).toBeGreaterThan(0);
  });

  it.each(samples)("carries no answer-bearing value, verbatim: %s", (_name, item) => {
    // A name is easy to change; the value is the thing that must not arrive. Serializing each
    // answer-bearing field and searching the payload for it catches a key copied out under an
    // innocent name — and, unlike the ids it references, a whole subtree does not collide with
    // anything in `content`.
    const json = JSON.stringify(toKeylessItem(item));
    const record = item as unknown as Record<string, unknown>;
    const secrets = ANSWER_BEARING_FIELDS.map((field) => JSON.stringify(record[field])).filter(
      (value): value is string => value !== undefined && value.length > 2,
    );
    expect(secrets.length).toBeGreaterThan(0);
    for (const secret of secrets) expect(json).not.toContain(secret);
  });

  it.each(samples)("is the item minus exactly its answer-bearing fields: %s", (_name, item) => {
    // The other half of the guarantee, and the guard on this refactor: an allow-list must not
    // quietly drop something a player renders. Every field the item has and the seam does not
    // call answer-bearing is present, with the same value, and nothing else is.
    const record = item as unknown as Record<string, unknown>;
    const payload = toKeylessItem(item) as Record<string, unknown>;
    const kept = Object.keys(record).filter((key) => !ANSWER_BEARING.has(key));
    expect(Object.keys(payload).sort()).toEqual([...kept].sort());
    // Ordered response is the one exception, and only in the order of its steps (#219).
    const started = withStartingOrder(item, item.id) as unknown as Record<string, unknown>;
    for (const key of kept) expect(payload[key]).toEqual(started[key]);
  });

  it("never lists ordered-response steps in the key's order (#219)", () => {
    for (const variant of ["canonical", "edge"] as const) {
      const item = ITEM_SCHEMAS.ordered_response.parse(FIXTURES.ordered_response[variant]);
      for (let s = 0; s < 50; s += 1) {
        const keyless = toKeylessItem(item, `session-${s}:${item.id}`);
        if (keyless.type !== "ordered_response") throw new Error("fixture changed type");
        const shown = keyless.content.items.map((step) => step.id);
        expect(shown).not.toEqual(item.answerKey.orderedIds);
        expect([...shown].sort()).toEqual([...item.answerKey.orderedIds].sort());
      }
      // The control: these items were authored in their key's order, so without the scramble
      // the payload's order would have been the answer.
      expect(item.content.items.map((step) => step.id)).toEqual(item.answerKey.orderedIds);
    }
  });

  it("seeds the ordered-response scramble by the item id unless told otherwise", () => {
    const item = ITEM_SCHEMAS.ordered_response.parse(FIXTURES.ordered_response.canonical);
    expect(toKeylessItem(item)).toEqual(toKeylessItem(item, item.id));
    const orders = new Set(
      Array.from({ length: 20 }, (_, s) => {
        const keyless = toKeylessItem(item, `attempt-${s}:${item.id}`);
        return keyless.type === "ordered_response"
          ? keyless.content.items.map((step) => step.id).join(",")
          : "";
      }),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("drops a top-level field it has never been taught the name of", () => {
    // A fifteenth item type, simulated. In the real thing the visibility table would not compile
    // until someone classified `solutionHint`; this is what happens meanwhile, and what happens to
    // a row written by a deploy this one has never heard of: the field is not copied at all.
    const invented = { ...parsed("multiple_choice"), solutionHint: { correctOptionId: "opt_a" } };
    const payload = toKeylessItem(invented as unknown as Item) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("solutionHint");
    expect(answerBearingIn(payload)).toEqual([]);
    expect(Object.keys(payload)).toEqual(Object.keys(toKeylessItem(parsed("multiple_choice"))));
  });

  it("does not change the item it is given", () => {
    const item = parsed("multiple_choice");
    const before = JSON.stringify(item);
    toKeylessItem(item);
    expect(JSON.stringify(item)).toBe(before);
  });

  it("keeps the item types apart, so type still says which content this is", () => {
    // A compile-time check as much as a runtime one: a plain `Omit` over the item union collapses
    // it, and `keyless.content.options` below would not type. KeylessItem distributes instead.
    const keyless: KeylessItem = toKeylessItem(parsed("multiple_choice"));
    if (keyless.type !== "multiple_choice") throw new Error("fixture changed type");
    expect(keyless.content.options.length).toBeGreaterThan(0);
  });
});

describe("toKeylessCaseStudy", () => {
  const caseStudy = caseStudySchema.parse(sampleCaseStudy);

  it("carries no answer-bearing property from any step, walked in full", () => {
    const payload = toKeylessCaseStudy(caseStudy);
    expect(answerBearingIn(payload)).toEqual([]);
    // Every one of the six steps was stripped, not just the one the student opens on.
    expect(payload.items).toHaveLength(6);
    expect(answerBearingIn(caseStudy).length).toBeGreaterThanOrEqual(18);
  });

  it("keeps the record and everything a student needs to answer each step", () => {
    const payload = toKeylessCaseStudy(caseStudy);
    expect(payload).toMatchObject({
      id: caseStudy.id,
      title: caseStudy.title,
      ehr: caseStudy.ehr,
    });
    expect(payload.items.map((item) => [item.id, item.type, item.cjmmStep])).toEqual(
      caseStudy.items.map((item) => [item.id, item.type, item.cjmmStep]),
    );
    payload.items.forEach((item, i) => {
      const step = caseStudy.items[i]!;
      expect(item.content).toEqual(withStartingOrder(step, step.id).content);
    });
  });

  it("does not change the case study it is given", () => {
    const before = JSON.stringify(caseStudy);
    toKeylessCaseStudy(caseStudy);
    expect(JSON.stringify(caseStudy)).toBe(before);
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
