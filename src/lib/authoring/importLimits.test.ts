import { describe, expect, it } from "vitest";
import * as limits from "./importLimits";
import * as transfer from "./transfer";

describe("importLimits", () => {
  it("is the same limits and messages that transfer re-exports", () => {
    expect(transfer.IMPORT_MAX_BYTES).toBe(limits.IMPORT_MAX_BYTES);
    expect(transfer.IMPORT_MAX_ITEMS).toBe(limits.IMPORT_MAX_ITEMS);
    expect(transfer.IMPORT_ERRORS).toBe(limits.IMPORT_ERRORS);
  });

  it("keeps the values the import has always used", () => {
    expect(limits.IMPORT_MAX_BYTES).toBe(800_000);
    expect(limits.IMPORT_MAX_ITEMS).toBe(50);
    expect(limits.IMPORT_ERRORS.itemCount).toBe(
      "Include between 1 and 50 items. Split a larger set into several files.",
    );
  });
});
