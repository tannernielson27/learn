import { describe, expect, it } from "vitest";
import { FIXTURES, allFixtures, sampleTrendEhr, sampleTrendItem } from "./fixtures";
import {
  initialResponse,
  isTrendItem,
  presentationOrder,
  unansweredResponse,
} from "./presentation";
import { itemSchema } from "./schemas";
import { emptyResponse } from "./scoring";

const ids = ["a", "b", "c", "d", "e"];

describe("presentationOrder", () => {
  it("returns a permutation of the ids", () => {
    expect([...presentationOrder(ids, "seed-1")].sort()).toEqual(ids);
  });

  it("is the same every time for the same seed", () => {
    expect(presentationOrder(ids, "item-42")).toEqual(presentationOrder(ids, "item-42"));
  });

  it("never returns the authored order", () => {
    for (let n = 0; n < 200; n++) {
      expect(presentationOrder(ids, `seed-${n}`)).not.toEqual(ids);
    }
    expect(presentationOrder(["x", "y"], "any")).toEqual(["y", "x"]);
  });

  it("varies with the seed", () => {
    const seen = new Set(
      Array.from({ length: 20 }, (_, n) => presentationOrder(ids, `s${n}`).join(",")),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("leaves short lists and its input alone", () => {
    const input = ["only"];
    expect(presentationOrder(input, "seed")).toEqual(["only"]);
    expect(presentationOrder([], "seed")).toEqual([]);
    const snapshot = [...ids];
    presentationOrder(ids, "seed");
    expect(ids).toEqual(snapshot);
  });
});

describe("initialResponse", () => {
  it("seeds an ordered response with the order the student sees", () => {
    const item = itemSchema.parse(FIXTURES.ordered_response.canonical);
    if (item.type !== "ordered_response") throw new Error("fixture type");
    const itemIds = item.content.items.map((i) => i.id);
    expect(initialResponse(item)).toEqual({
      type: "ordered_response",
      orderedIds: presentationOrder(itemIds, item.id),
    });
  });

  it("is the empty response for every other type", () => {
    for (const fixture of allFixtures) {
      const item = itemSchema.parse(fixture.canonical);
      if (item.type === "ordered_response") continue;
      expect(initialResponse(item)).toEqual(emptyResponse(item));
    }
  });
});

describe("unansweredResponse (#181)", () => {
  it("lays an ordered response out in the key's order, so the right order is what shows", () => {
    const item = itemSchema.parse(FIXTURES.ordered_response.canonical);
    if (item.type !== "ordered_response") throw new Error("fixture type");
    expect(unansweredResponse(item)).toEqual({
      type: "ordered_response",
      orderedIds: item.answerKey.orderedIds,
    });
  });

  it("is the empty response for every other type: nothing chosen, so every key element is missed", () => {
    for (const fixture of allFixtures) {
      const item = itemSchema.parse(fixture.canonical);
      if (item.type === "ordered_response") continue;
      expect(unansweredResponse(item)).toEqual(emptyResponse(item));
    }
  });

  it("does not hand back the key's own array", () => {
    const item = itemSchema.parse(FIXTURES.ordered_response.canonical);
    if (item.type !== "ordered_response") throw new Error("fixture type");
    const response = unansweredResponse(item);
    if (response.type !== "ordered_response") throw new Error("response type");
    expect(response.orderedIds).not.toBe(item.answerKey.orderedIds);
  });
});

describe("isTrendItem", () => {
  const plain = itemSchema.parse(FIXTURES.matrix_multiple_choice.canonical);
  const trend = itemSchema.parse(sampleTrendItem);

  it("is true only when the attached record is charted more than once", () => {
    expect(isTrendItem(trend)).toBe(true);
    expect(isTrendItem(plain)).toBe(false);
  });

  it("is false for a record charted once, which needs no time selector", () => {
    const single = itemSchema.parse({
      ...sampleTrendItem,
      ehr: {
        ...sampleTrendEhr,
        timePoints: [{ id: "tp_0800", label: "0800" }],
        tabs: sampleTrendEhr.tabs.filter(
          (tab) => tab.timePointId === undefined || tab.timePointId === "tp_0800",
        ),
      },
    });
    expect(isTrendItem(single)).toBe(false);
  });
});
