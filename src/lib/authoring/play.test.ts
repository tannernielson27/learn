// ADR 0003: every student-facing payload builder ships with a test that it never includes the key.
import { describe, expect, it } from "vitest";
import { EDITOR_READY_TYPES } from "@/lib/authoring/itemTypeGroups";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_SCHEMAS, type Item } from "@/lib/ngn/schemas";
import { toKeylessPlayItem } from "./play";

// The Sprint 1 types, which are the ones an author can build and play this sprint.
const sprintOneSamples = [...EDITOR_READY_TYPES].flatMap((type) => {
  const fixture = FIXTURES[type];
  return [
    [`${type} canonical`, ITEM_SCHEMAS[type].parse(fixture.canonical) as Item],
    [`${type} edge`, ITEM_SCHEMAS[type].parse(fixture.edge) as Item],
  ] as const;
});

describe("toKeylessPlayItem", () => {
  it("covers all eight Sprint 1 types", () => {
    expect(new Set(sprintOneSamples.map(([, item]) => item.type)).size).toBe(8);
  });

  it.each(sprintOneSamples)("never includes the answer key or rationale: %s", (_name, item) => {
    const payload = toKeylessPlayItem(item);
    expect(payload).not.toHaveProperty("answerKey");
    expect(payload).not.toHaveProperty("rationale");
    // Serialized too, so nothing nested carries them either. Keys only: "rationale" is also the
    // name of a scoring model, which the player needs.
    const json = JSON.stringify(payload);
    expect(json).not.toContain('"answerKey":');
    expect(json).not.toContain('"rationale":');
    expect(json).not.toMatch(/"correct[A-Za-z]*":/);
  });

  it.each(sprintOneSamples)("keeps what the player needs to render: %s", (_name, item) => {
    const payload = toKeylessPlayItem(item);
    expect(payload).toMatchObject({
      id: item.id,
      type: item.type,
      stem: item.stem,
      content: item.content,
      scoring: item.scoring,
    });
  });

  it("does not change the item it is given", () => {
    const item = ITEM_SCHEMAS.multiple_choice.parse(FIXTURES.multiple_choice.canonical) as Item;
    const before = JSON.stringify(item);
    toKeylessPlayItem(item);
    expect(JSON.stringify(item)).toBe(before);
  });
});
