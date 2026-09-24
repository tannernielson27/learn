import { describe, expect, it } from "vitest";
import { FIXTURES, allFixtures, sampleTrendEhr, sampleTrendItem } from "./fixtures";
import { initialResponse, isTrendItem, unansweredResponse } from "./presentation";
import { itemSchema, type Item } from "./schemas";
import { emptyResponse } from "./scoring";
import { startingOrder, startingOrderSeed } from "./startingOrder";
import { toKeylessItem } from "./submit";

function orderedFixture(): Extract<Item, { type: "ordered_response" }> {
  const item = itemSchema.parse(FIXTURES.ordered_response.canonical);
  if (item.type !== "ordered_response") throw new Error("fixture type");
  return item;
}

describe("initialResponse", () => {
  it("starts a whole ordered-response item from its starting order, never the key (#219)", () => {
    const item = orderedFixture();
    const response = initialResponse(item);
    expect(response).toEqual({
      type: "ordered_response",
      orderedIds: startingOrder(
        item.content.items.map((step) => step.id),
        item.answerKey.orderedIds,
        item.id,
      ),
    });
    if (response.type !== "ordered_response") throw new Error("type");
    expect(response.orderedIds).not.toEqual(item.answerKey.orderedIds);
  });

  it("starts a keyless item from the order the server sent, which is already scrambled", () => {
    const item = orderedFixture();
    for (let s = 0; s < 30; s += 1) {
      const keyless = toKeylessItem(item, startingOrderSeed(`session-${s}`, item.id));
      if (keyless.type !== "ordered_response") throw new Error("type");
      const response = initialResponse(keyless);
      if (response.type !== "ordered_response") throw new Error("type");
      // Taken as sent: a second scramble in the browser, which has no key, could land on it.
      expect(response.orderedIds).toEqual(keyless.content.items.map((step) => step.id));
      expect(response.orderedIds).not.toEqual(item.answerKey.orderedIds);
    }
  });

  it("starts the gallery and the author's keyless play page in the same order", () => {
    const item = orderedFixture();
    expect(initialResponse(toKeylessItem(item))).toEqual(initialResponse(item));
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
