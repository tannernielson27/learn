import { describe, expect, it } from "vitest";
import { FIXTURES, sampleCaseStudy } from "@/lib/ngn/fixtures";
import { MAX_ITEM_PAYLOAD_BYTES, withinItemSizeLimit } from "./payloadSize";

describe("withinItemSizeLimit", () => {
  it("accepts every sample item, including ones with a full patient record", () => {
    for (const fixture of Object.values(FIXTURES)) {
      expect(withinItemSizeLimit(fixture.canonical)).toBe(true);
    }
    for (const item of sampleCaseStudy.items) {
      expect(withinItemSizeLimit({ ...item, ehr: sampleCaseStudy.ehr })).toBe(true);
    }
  });

  it("refuses a payload whose serialized size is over the limit", () => {
    const oversized = {
      ...FIXTURES.multiple_choice.canonical,
      meta: { sourceNote: "a".repeat(MAX_ITEM_PAYLOAD_BYTES) },
    };
    expect(withinItemSizeLimit(oversized)).toBe(false);
  });

  it("counts bytes, not characters, so multi-byte text cannot slip past", () => {
    const characters = Math.floor(MAX_ITEM_PAYLOAD_BYTES / 3) + 10;
    // "°" is two bytes and "🩺" four in UTF-8; either way the byte count passes the limit.
    expect(withinItemSizeLimit({ note: "🩺".repeat(characters) })).toBe(false);
  });

  it("refuses values that cannot be serialized rather than throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(withinItemSizeLimit(cyclic)).toBe(false);
    expect(withinItemSizeLimit(BigInt(1))).toBe(false);
  });

  it("sets a limit far above a real item and far below Next's request limit", () => {
    expect(MAX_ITEM_PAYLOAD_BYTES).toBe(200_000);
  });
});
