import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { EDITOR_READY_TYPES, ITEM_TYPE_GROUPS, isEditorReady } from "./itemTypeGroups";

describe("ITEM_TYPE_GROUPS", () => {
  it("lists every item type exactly once", () => {
    const listed = ITEM_TYPE_GROUPS.flatMap((group) => group.types);
    expect([...listed].sort()).toEqual([...ITEM_TYPES].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("names each group and never leaves one empty", () => {
    for (const group of ITEM_TYPE_GROUPS) {
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.types.length).toBeGreaterThan(0);
    }
  });

  it("puts selection formats first, where most items start", () => {
    expect(ITEM_TYPE_GROUPS[0].types).toContain("multiple_response");
  });
});

describe("isEditorReady", () => {
  it("enables every item type, now that each has an editor", () => {
    expect([...EDITOR_READY_TYPES].sort()).toEqual([...ITEM_TYPES].sort());
    for (const type of ITEM_TYPES) expect(isEditorReady(type)).toBe(true);
  });
});
