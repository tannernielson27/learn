import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, endTally, noteItem, parseHistory, worthWords } from "./history";

const seen = (position: number, over: Partial<Parameters<typeof noteItem>[1]> = {}) => ({
  position,
  itemId: `item_${position}`,
  cjmmStep: null,
  answered: true,
  points: null,
  maxPoints: null,
  ...over,
});

describe("noteItem", () => {
  it("keeps one entry per question, the newest facts winning", () => {
    let history = noteItem(EMPTY_HISTORY, seen(2));
    history = noteItem(history, seen(1, { answered: false }));
    history = noteItem(history, seen(2, { points: 1, maxPoints: 1 }));
    expect(history.map((entry) => [entry.position, entry.points])).toEqual([
      [1, null],
      [2, 1],
    ]);
  });

  it("does not forget an answer when a later look at the question has none", () => {
    const history = noteItem(noteItem(EMPTY_HISTORY, seen(1)), seen(1, { answered: false }));
    expect(history[0]?.answered).toBe(true);
  });

  it("keeps the marks it has when a later look carries none", () => {
    const marked = noteItem(EMPTY_HISTORY, seen(1, { points: 2, maxPoints: 3 }));
    expect(noteItem(marked, seen(1))[0]).toMatchObject({ points: 2, maxPoints: 3 });
  });

  it("returns the same history when nothing new was learned", () => {
    const history = noteItem(EMPTY_HISTORY, seen(1));
    expect(noteItem(history, seen(1))).toBe(history);
  });
});

describe("endTally", () => {
  const history = [
    seen(1, { points: 1, maxPoints: 1 }),
    seen(2, { points: 0, maxPoints: 1, cjmmStep: 3 }),
    seen(3, { points: 2, maxPoints: 3 }),
    seen(4, { answered: false, points: null, maxPoints: null, revealed: true }),
    seen(5, { answered: true }),
  ];

  it("counts the answers sent and the ones marked all correct", () => {
    expect(endTally(history)).toMatchObject({ answered: 4, allCorrect: 1, marked: 3 });
  });

  it("lists what is worth another look: not correct, part marks and unanswered reveals", () => {
    expect(endTally(history).worthALook.map((entry) => entry.position)).toEqual([2, 3, 4]);
  });
});

describe("worthWords", () => {
  it("says how each one went in words, never colour alone", () => {
    expect(worthWords(seen(1, { points: 0, maxPoints: 1 }))).toBe("Not correct");
    expect(worthWords(seen(1, { points: 2, maxPoints: 3 }))).toBe("2 of 3");
    expect(worthWords(seen(1, { answered: false }))).toBe("Not answered");
  });
});

describe("parseHistory", () => {
  it("reads back what was stored, and nothing it does not recognise", () => {
    const history = noteItem(EMPTY_HISTORY, seen(1, { points: 1, maxPoints: 1 }));
    expect(parseHistory(JSON.stringify(history))).toEqual(history);
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
    expect(parseHistory("{nope")).toEqual(EMPTY_HISTORY);
    expect(parseHistory(JSON.stringify([{ position: "1" }]))).toEqual(EMPTY_HISTORY);
  });
});
