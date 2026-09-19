import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import {
  HISTORY_LIMIT,
  NO_CHANGES,
  formatPublished,
  readVersion,
  sameJson,
  summarizeChanges,
} from "./versionHistory";

const item = () =>
  JSON.parse(JSON.stringify(FIXTURES.multiple_choice.canonical)) as Record<string, unknown>;

describe("sameJson", () => {
  it("ignores key order, as jsonb does not keep it", () => {
    expect(sameJson({ a: 1, b: { c: [1, 2], d: "x" } }, { b: { d: "x", c: [1, 2] }, a: 1 })).toBe(
      true,
    );
  });

  it("treats a missing value, undefined and null alike", () => {
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson({ a: null }, {})).toBe(true);
    expect(sameJson(undefined, null)).toBe(true);
  });

  it("sees a changed value, a reordered list and a different kind of value", () => {
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson([1], [1, 2])).toBe(false);
    expect(sameJson({ a: [1] }, { a: { 0: 1 } })).toBe(false);
    expect(sameJson({ a: 1 }, [1])).toBe(false);
    expect(sameJson("1", 1)).toBe(false);
  });
});

describe("summarizeChanges", () => {
  it("says so when a version matches the draft", () => {
    expect(summarizeChanges(item(), item())).toEqual([]);
  });

  it("names the stem, options, answer key and rationale when each changed", () => {
    const draft = item();
    draft.stem = { kind: "markdown", value: "A new stem" };
    draft.content = { options: [{ id: "opt_a", label: "Only one" }] };
    draft.answerKey = { correctOptionId: "opt_b" };
    draft.rationale = {};
    expect(summarizeChanges(item(), draft)).toEqual([
      "The stem changed.",
      "The options changed.",
      "The answer key changed.",
      "The rationale changed.",
    ]);
  });

  it("names the instructions, patient record and tags when each changed", () => {
    const draft = item();
    draft.instructions = "Choose one.";
    draft.ehr = { patientHeader: { age: 60, sex: "male", setting: "ED" } };
    draft.tags = ["cardiac"];
    expect(summarizeChanges(item(), draft)).toEqual([
      "The instructions changed.",
      "The patient record changed.",
      "The tags changed.",
    ]);
  });

  it("describes the scoring on both sides when it changed", () => {
    const draft = item();
    draft.scoring = { model: "plus_minus", maxPoints: 3 };
    expect(summarizeChanges(item(), draft)).toEqual([
      "The scoring changed: this version is worth 1 point with 0/1 scoring; the draft is worth 3 points with +/- scoring.",
    ]);
  });

  it("says the scoring changed without guessing when a side has none", () => {
    const draft = item();
    delete draft.scoring;
    expect(summarizeChanges(item(), draft)).toEqual(["The scoring changed."]);
    expect(
      summarizeChanges({ ...item(), scoring: { model: "odd", maxPoints: 1 } }, item()),
    ).toEqual(["The scoring changed."]);
  });

  it("reads tags as a set, so reordering them is no change", () => {
    const draft = item();
    draft.tags = [...(draft.tags as string[])].reverse();
    expect(summarizeChanges(item(), draft)).toEqual([]);
  });

  it("reads anything that is not an object as empty", () => {
    expect(summarizeChanges(null, "draft")).toEqual([]);
  });

  it("has a sentence for no changes", () => {
    expect(NO_CHANGES).toBe("Same as the saved draft.");
  });
});

describe("readVersion", () => {
  const published = "2026-09-18T15:30:00.000Z";

  it("reads a valid snapshot of the item's own type", () => {
    const result = readVersion(
      { version: 2, created_at: published, snapshot: item() },
      "multiple_choice",
    );
    expect(result).toMatchObject({ version: 2, publishedAt: published, ok: true });
    expect(result.ok && result.item.type).toBe("multiple_choice");
  });

  it("gives a plain reason for a snapshot that no longer validates", () => {
    const snapshot = { ...item(), content: { options: [] } };
    const result = readVersion({ version: 1, created_at: published, snapshot }, "multiple_choice");
    expect(result).toEqual({
      version: 1,
      publishedAt: published,
      ok: false,
      snapshot,
      reason:
        "This version no longer matches the current question format, so it can be read here but not restored.",
    });
  });

  it("refuses a snapshot of another item type", () => {
    const result = readVersion(
      { version: 1, created_at: published, snapshot: item() },
      "multiple_response",
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "This version is a different kind of question, so it cannot be restored here.",
    });
  });
});

describe("formatPublished", () => {
  it("dates a version in UTC, so the server and browser agree", () => {
    expect(formatPublished("2026-09-18T23:30:00.000Z")).toBe("Published Sep 18, 2026");
  });
});

it("lists a bounded number of versions", () => {
  expect(HISTORY_LIMIT).toBe(50);
});
