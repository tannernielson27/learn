import { describe, expect, it } from "vitest";
import {
  moveEntry,
  moveEntryTo,
  orderChanged,
  parseQuizOrderForm,
  positionMessage,
  QUIZ_ORDER_ERRORS,
  QUIZ_ORDER_MAX,
  quizOrderError,
} from "./quizOrder";

const A = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
const B = "0b7a2c1d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const C = "1c8b3d2e-5f60-4b7c-9d8e-0f1a2b3c4d5e";

describe("moveEntry", () => {
  it("moves an entry one place up or down", () => {
    expect(moveEntry(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveEntry(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("leaves the order as it is past either end, or for an id it does not hold", () => {
    expect(moveEntry(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveEntry(["a", "b"], "b", "down")).toEqual(["a", "b"]);
    expect(moveEntry(["a", "b"], "z", "up")).toEqual(["a", "b"]);
  });

  it("returns a new array and never changes the one it was given", () => {
    const order = ["a", "b"];
    const next = moveEntry(order, "b", "up");
    expect(order).toEqual(["a", "b"]);
    expect(next).not.toBe(order);
  });
});

describe("moveEntryTo", () => {
  it("moves a dragged entry to where it was dropped", () => {
    expect(moveEntryTo(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(moveEntryTo(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("changes nothing when either id is unknown or they are the same", () => {
    expect(moveEntryTo(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveEntryTo(["a", "b"], "a", "z")).toEqual(["a", "b"]);
    expect(moveEntryTo(["a", "b"], "z", "a")).toEqual(["a", "b"]);
  });
});

describe("orderChanged", () => {
  it("tells a new order from the saved one", () => {
    expect(orderChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(orderChanged(["a", "b"], ["b", "a"])).toBe(true);
    expect(orderChanged(["a"], ["a", "b"])).toBe(true);
  });
});

describe("positionMessage", () => {
  it("says where an entry now is, for the status region", () => {
    expect(positionMessage("Sepsis", 1, 4)).toBe("Sepsis, position 2 of 4.");
  });
});

describe("parseQuizOrderForm", () => {
  const form = (ids: readonly string[]) => {
    const data = new FormData();
    for (const id of ids) data.append("entry", id);
    return data;
  };

  it("reads the entries in the order the form holds them", () => {
    expect(parseQuizOrderForm(form([B, A, C]))).toEqual({ ok: true, ids: [B, A, C] });
  });

  it.each([
    ["nothing", []],
    ["a value that is not an id", [A, "not-an-id"]],
    ["the same entry twice", [A, B, A]],
  ])("refuses %s", (_label, ids) => {
    expect(parseQuizOrderForm(form(ids))).toEqual({ ok: false, error: QUIZ_ORDER_ERRORS.changed });
  });

  it("refuses more than the quiz order can hold", () => {
    const ids = Array.from(
      { length: QUIZ_ORDER_MAX + 1 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );
    expect(parseQuizOrderForm(form(ids))).toEqual({ ok: false, error: QUIZ_ORDER_ERRORS.tooMany });
  });

  it("refuses a file in place of an id", () => {
    const data = new FormData();
    data.append("entry", new Blob(["x"]));
    expect(parseQuizOrderForm(data)).toEqual({ ok: false, error: QUIZ_ORDER_ERRORS.changed });
  });
});

describe("quizOrderError", () => {
  it.each([
    [{ code: "22023", hint: "stale" }, QUIZ_ORDER_ERRORS.changed],
    [{ code: "22023" }, QUIZ_ORDER_ERRORS.changed],
    [{ code: "P0002" }, QUIZ_ORDER_ERRORS.gone],
    [{ code: "54000" }, QUIZ_ORDER_ERRORS.limited],
    [{ code: "PGRST202" }, QUIZ_ORDER_ERRORS.notReady],
    [{ code: "42883" }, QUIZ_ORDER_ERRORS.notReady],
    [{ code: "XX000" }, QUIZ_ORDER_ERRORS.failed],
    [{}, QUIZ_ORDER_ERRORS.failed],
  ])("words %j for a teacher", (error, message) => {
    expect(quizOrderError(error)).toBe(message);
  });
});
