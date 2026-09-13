import { describe, expect, it } from "vitest";
import { isUuid } from "./ids";

describe("isUuid", () => {
  it.each([["00000000-0000-4000-8000-000000000002"], ["6FA459EA-EE8A-3CA4-894E-DB77E160355E"]])(
    "accepts %s",
    (value) => {
      expect(isUuid(value)).toBe(true);
    },
  );

  it.each([
    [""],
    ["not-a-uuid"],
    ["00000000-0000-4000-8000-00000000000"],
    ["00000000-0000-4000-8000-0000000000022"],
    ["00000000-0000-4000-8000-00000000000g"],
    ["../00000000-0000-4000-8000-000000000002"],
    [" 00000000-0000-4000-8000-000000000002"],
  ])("rejects %j", (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
